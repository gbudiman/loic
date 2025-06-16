/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import commonParams from "./utils/commonParams";

export type TRequestResult = {
	startsAt: number;
	completedAt: number;
	durationMs: number;
	workerId: string;
	requestId: number;
	sequenceId: string;
	successful: boolean;
	status: number;
	result: unknown;
}

export type TSessionResult = {
	requestsSucceeded: number;
	requestsFailed: number;
	totalRequests: number;
	minRequestDelay: number;
	maxRequestDelay: number;
	minExecutionTime: number;
	maxExecutionTime: number;
	avgExecutionTime: number;
	flattenedResults: TRequestResult[];
}

interface Env {
	service_token: string;
	loic_token: string;
	basic_auth?: string;
	bypass_key?: string;
	bypass_value?: string;
}

const executeAsParent = async ({ url, token }: { url: URL, token: string }) => {
	const { fanoutCount, requestsPerWorker, sequenceId, selfUrl, targetUrl } = commonParams({ url })
	const launches = Array.from({ length: fanoutCount }, (_, i) => {
		const childUrl = new URL(selfUrl)
		childUrl.searchParams.set('mode', 'child')
		childUrl.searchParams.set('requests_per_worker', requestsPerWorker.toString())
		childUrl.searchParams.set('worker_id', i.toString())
		childUrl.searchParams.set('sequence_id', sequenceId)
		childUrl.searchParams.set('target_url', targetUrl)

		return fetch(childUrl.toString(), {
			method: 'POST',
			headers: {
				"X-Service-Token": token
			}
		}).then(async res => {
			const workerResult: { requestResults: TRequestResult[] } = await res.json()

			return {
				workerId: i,
				workerResult
			}
		})
	})

	const sessionResults = await Promise.all(launches)
	const flattenedResults = sessionResults.flatMap(worker => worker.workerResult.requestResults)
	const minStartTime = Math.min(...flattenedResults.map(r => r.startsAt))

	return new Response(JSON.stringify({
		requestsSucceeded: flattenedResults.filter(r => r.successful).length,
		requestsFailed: flattenedResults.filter(r => !r.successful).length,
		totalRequests: flattenedResults.length,
		minRequestDelay: Math.min(...flattenedResults.map(x => x.startsAt - minStartTime)),
		maxRequestDelay: Math.max(...flattenedResults.map(x => x.startsAt - minStartTime)),
		minExecutionTime: Math.min(...flattenedResults.map(x => x.durationMs)),
		maxExecutionTime: Math.max(...flattenedResults.map(x => x.durationMs)),
		avgExecutionTime: flattenedResults.reduce((sum, x) => sum + x.durationMs, 0) / flattenedResults.length,
		flattenedResults: flattenedResults.sort((a, b) => a.startsAt - b.startsAt),
	} as TSessionResult))
}

const executeAsChild = async ({ url, env, token }: { url: URL, env: Env, token: string }) => {
	const { workerId, requestsPerWorker, sequenceId, targetUrl } = commonParams({ url })
	const launches = Array.from({ length: requestsPerWorker }, (_, i) => {
		const startsAt = performance.now()

		return fetch(targetUrl, {
			method: 'POST',
			headers: {
				"Content-Type": "application/json",
				"X-Request-ID": String(i),
				"X-Worker-ID": String(workerId),
				"X-Sequence-ID": sequenceId,
				"X-LOIC-Service-Token": env.loic_token,
				"Authorization": env.basic_auth ? `Basic ${env.basic_auth}` : '',
				...(env.bypass_key ? { [env.bypass_key]: env.bypass_value } : {})
			}
		}).then(async res => {
			const result = await res.json()
			const completedAt = performance.now()

			return {
				startsAt,
				workerId: workerId,
				requestId: i,
				sequenceId: sequenceId,
				successful: res.ok,
				status: res.status,
				result: result,
				completedAt,
				durationMs: completedAt - startsAt
			} as TRequestResult
		}).catch(err => {
			const completedAt = performance.now()

			return {
				startsAt,
				workerId: workerId,
				requestId: i,
				sequenceId: sequenceId,
				successful: false,
				status: err.status,
				result: err.message,
				completedAt,
				durationMs: completedAt - startsAt
			} as TRequestResult
		})
	})

	const requestResults = await Promise.all(launches)
	return new Response(JSON.stringify({
		requestResults
	}))
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url)
		const token = request.headers.get('X-Service-Token')
		const mode = url.searchParams.get('mode')

		if (token !== env.service_token) {
			return new Response(JSON.stringify({
				error: 'Service Token Required'
			}))
		}

		return (mode === 'child') ? executeAsChild({ url, token, env }) : executeAsParent({ url, token })
	},
} satisfies ExportedHandler<Env>;
