import {
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { TRequestResult, TSessionResult } from "../types";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const testEnv = {
	service_token: "test-token",
	loic_token: "loic-test-token",
	basic_auth: "dGVzdDp0ZXN0",
	bypass_key: "X-bypass-key",
	bypass_value: "bypass-value",
};

describe("executeAsParent", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should orchestrate fanout requests and aggregate results", async () => {
		const mockChildResponse = {
			requestResults: [
				{
					startsAt: 1000,
					completedAt: 1100,
					durationMs: 100,
					workerId: 0,
					requestId: 0,
					sequenceId: "test-sequence",
					successful: true,
					status: 200,
					result: { success: true },
				},
			],
		};

		vi.mocked(fetch).mockResolvedValue({
			json: () => Promise.resolve(mockChildResponse),
			ok: true,
		} as Response);

		const request = new IncomingRequest(
			"http://example.com?target_url=http://target.com&fanout=2&requests_per_worker=1",
		);
		request.headers.set("X-Service-Token", "test-token");
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);

		const result = await response.json();

		expect(result).toEqual({
			requestsSucceeded: 2,
			requestsFailed: 0,
			totalRequests: 2,
			minRequestDelay: 0,
			maxRequestDelay: 0,
			minExecutionTime: 100,
			maxExecutionTime: 100,
			avgExecutionTime: 100,
			flattenedResults: expect.arrayContaining([
				expect.objectContaining({
					successful: true,
					status: 200,
					durationMs: 100,
				}),
			]),
		});

		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("should handle failed child worker responses", async () => {
		const mockChildResponse = {
			requestResults: [
				{
					startsAt: 1000,
					completedAt: 1200,
					durationMs: 200,
					workerId: 0,
					requestId: 0,
					sequenceId: "test-sequence",
					successful: false,
					status: 500,
					result: { error: "Server error" },
				},
			],
		};

		vi.mocked(fetch).mockResolvedValue({
			json: () => Promise.resolve(mockChildResponse),
			ok: true,
		} as Response);

		const request = new IncomingRequest(
			"http://example.com?target_url=http://target.com&fanout=1&requests_per_worker=1",
		);
		request.headers.set("X-Service-Token", "test-token");
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);

		const result: TSessionResult = await response.json();

		// expect(result.requestsSucceeded).toBe(0);
		// expect(result.requestsFailed).toBe(1);
		// expect(result.totalRequests).toBe(1);
		expect(result).toEqual({
			requestsSucceeded: 0,
			requestsFailed: 1,
			totalRequests: 1,
			minRequestDelay: 0,
			maxRequestDelay: 0,
			minExecutionTime: 200,
			maxExecutionTime: 200,
			avgExecutionTime: 200,
			flattenedResults: expect.arrayContaining([
				expect.objectContaining({
					successful: false,
					status: 500,
					durationMs: 200,
					result: { error: "Server error" },
				}),
			]),
		});
	});

	it("should limit fanout and requests per worker to maximum of 100", async () => {
		const mockChildResponse = {
			requestResults: [
				{
					startsAt: 1000,
					completedAt: 1100,
					durationMs: 100,
					workerId: 0,
					requestId: 0,
					sequenceId: "test-sequence",
					successful: true,
					status: 200,
					result: {},
				},
			],
		};

		vi.mocked(fetch).mockResolvedValue({
			json: () => Promise.resolve(mockChildResponse),
			ok: true,
		} as Response);

		const testEnv = {
			service_token: "test-token",
			loic_token: "loic-test-token",
		};

		const request = new IncomingRequest(
			"http://example.com?target_url=http://target.com&fanout=150&requests_per_worker=150",
		);
		request.headers.set("X-Service-Token", "test-token");
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(fetch).toHaveBeenCalledTimes(100);
	});
});

describe("executeAsChild", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should make requests to target URL and return results", async () => {
		vi.mocked(fetch).mockResolvedValue({
			json: () => Promise.resolve({ success: true }),
			ok: true,
			status: 200,
		} as Response);

		const request = new IncomingRequest(
			"http://example.com?mode=child&target_url=http://target.com&worker_id=0&requests_per_worker=2&sequence_id=test-seq",
		);
		request.headers.set("X-Service-Token", "test-token");
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);

		const result: { requestResults: TRequestResult[] } = await response.json();

		expect(result.requestResults).toMatchObject([
			{
				workerId: "0",
				requestId: 0,
				sequenceId: "test-seq",
				successful: true,
				status: 200,
				result: { success: true },
			},
			{
				workerId: "0",
				requestId: 1,
				sequenceId: "test-seq",
				successful: true,
				status: 200,
				result: { success: true },
			},
		]);

		expect(fetch).toHaveBeenCalledWith("http://target.com", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Request-ID": "0",
				"X-Worker-ID": "0",
				"X-Sequence-ID": "test-seq",
				"X-LOIC-Service-Token": "loic-test-token",
				Authorization: `Basic ${testEnv.basic_auth}`,
				"X-bypass-key": "bypass-value",
			},
		});
	});

	it("should handle failed requests", async () => {
		vi.mocked(fetch).mockRejectedValue({
			status: 400,
			message: "Request not fulfilled",
		});

		const request = new IncomingRequest(
			"http://example.com?mode=child&target_url=http://target.com&worker_id=1&requests_per_worker=1&sequence_id=test-seq",
		);
		request.headers.set("X-Service-Token", "test-token");
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);

		const result: { requestResults: TRequestResult[] } = await response.json();

		expect(result.requestResults).toMatchObject([
			{
				workerId: "1",
				requestId: 0,
				sequenceId: "test-seq",
				successful: false,
				status: 400,
				result: "Request not fulfilled",
			},
		]);
	});
});
