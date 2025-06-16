import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import commonParams from '../commonParams';

describe('commonParams', () => {
	beforeEach(() => {
		vi.stubGlobal('crypto', {
			randomUUID: vi.fn().mockReturnValueOnce('mock-uuid-123').mockReturnValueOnce('mock-uuid-456')
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('provides sane defaults for all parameters', () => {
		const url = new URL('http://example.com/path');
		const result = commonParams({ url });
		expect(result).toEqual({
			targetUrl: '',
			sequenceId: 'mock-uuid-123',
			workerId: 'mock-uuid-456',
			requestsPerWorker: 2,
			fanoutCount: 2,
			selfUrl: 'http://example.com/path'
		});
	})

	it('sets targetUrl from search params', () => {
		const url = new URL('http://example.com/path?target_url=http://target.com/path?params=123');
		const result = commonParams({ url });
		expect(result.targetUrl).toBe('http://target.com/path?params=123');
	})

	it('sets sequenceId from search params', () => {
		const url = new URL('http://example.com/path?sequence_id=custom-seq-id');
		const result = commonParams({ url });
		expect(result.sequenceId).toBe('custom-seq-id');
	})

	it('sets workerId from search params', () => {
		const url = new URL('http://example.com/path?worker_id=5');
		const result = commonParams({ url });
		expect(result.workerId).toBe('5');
	})

	describe('requestsPerWorker', () => {
		it('sets from search params', () => {
			const url = new URL('http://example.com/path?requests_per_worker=10');
			const result = commonParams({ url });
			expect(result.requestsPerWorker).toBe(10);
		})

		it('limits maximum to 50', () => {
			const url = new URL('http://example.com/path?requests_per_worker=100');
			const result = commonParams({ url });
			expect(result.requestsPerWorker).toBe(50);
		})

		it('limits minimum to 1', () => {
			const url = new URL('http://example.com/path?requests_per_worker=-10');
			const result = commonParams({ url });
			expect(result.requestsPerWorker).toBe(1);
		})
	})

	describe('fanoutCount', () => {
		it('sets from search params', () => {
			const url = new URL('http://example.com/path?fanout=5');
			const result = commonParams({ url });
			expect(result.fanoutCount).toBe(5);
		})

		it('limits to 100', () => {
			const url = new URL('http://example.com/path?fanout=200');
			const result = commonParams({ url });
			expect(result.fanoutCount).toBe(100);
		})

		it('limits minimum to 1', () => {
			const url = new URL('http://example.com/path?fanout=-10');
			const result = commonParams({ url });
			expect(result.fanoutCount).toBe(1);
		})
	})

	it('constructs selfUrl from origin and pathname', () => {
		const url = new URL('http://example.com:8080/api/v1/endpoint?param=value');
		const result = commonParams({ url });
		expect(result.selfUrl).toBe('http://example.com:8080/api/v1/endpoint');
	});



	// it('should extract and return all parameters with defaults', () => {
	// 	const url = new URL('http://example.com/path');
		
	// 	const result = commonParams({ url });

	// 	expect(result).toEqual({
	// 		targetUrl: '',
	// 		sequenceId: 'mock-uuid-123',
	// 		workerId: 0,
	// 		requestsPerWorker: 2,
	// 		fanoutCount: 2,
	// 		selfUrl: 'http://example.com/path'
	// 	});
	// });

	// it('should extract parameters from URL search params', () => {
	// 	const url = new URL('http://example.com/path?target_url=http://target.com&sequence_id=seq-123&worker_id=5&requests_per_worker=10&fanout=3');
		
	// 	const result = commonParams({ url });

	// 	expect(result).toEqual({
	// 		targetUrl: 'http://target.com',
	// 		sequenceId: 'seq-123',
	// 		workerId: 5,
	// 		requestsPerWorker: 10,
	// 		fanoutCount: 3,
	// 		selfUrl: 'http://example.com/path'
	// 	});
	// });

	// it('should limit requestsPerWorker to maximum of 50', () => {
	// 	const url = new URL('http://example.com?requests_per_worker=150');
		
	// 	const result = commonParams({ url });

	// 	expect(result.requestsPerWorker).toBe(50);
	// });

	// it('should limit fanoutCount to maximum of 100', () => {
	// 	const url = new URL('http://example.com?fanout=200');
		
	// 	const result = commonParams({ url });

	// 	expect(result.fanoutCount).toBe(100);
	// });

	// it('should handle invalid numeric parameters gracefully', () => {
	// 	const url = new URL('http://example.com?worker_id=invalid&requests_per_worker=invalid&fanout=invalid');
		
	// 	const result = commonParams({ url });

	// 	expect(result.workerId).toBe(0);
	// 	expect(result.requestsPerWorker).toBe(2);
	// 	expect(result.fanoutCount).toBe(2);
	// });

	// it('should generate UUID when sequence_id is not provided', () => {
	// 	const url = new URL('http://example.com');
		
	// 	const result = commonParams({ url });

	// 	expect(result.sequenceId).toBe('mock-uuid-123');
	// 	expect(vi.mocked(crypto.randomUUID)).toHaveBeenCalled();
	// });

	// it('should use provided sequence_id when available', () => {
	// 	const url = new URL('http://example.com?sequence_id=custom-seq-id');
		
	// 	const result = commonParams({ url });

	// 	expect(result.sequenceId).toBe('custom-seq-id');
	// 	expect(vi.mocked(crypto.randomUUID)).not.toHaveBeenCalled();
	// });

	// it('should construct selfUrl from origin and pathname', () => {
	// 	const url = new URL('http://example.com:8080/api/v1/endpoint?param=value');
		
	// 	const result = commonParams({ url });

	// 	expect(result.selfUrl).toBe('http://example.com:8080/api/v1/endpoint');
	// });

	// it('should handle empty target_url parameter', () => {
	// 	const url = new URL('http://example.com?target_url=');
		
	// 	const result = commonParams({ url });

	// 	expect(result.targetUrl).toBe('');
	// });

	// it('should handle zero values for numeric parameters', () => {
	// 	const url = new URL('http://example.com?worker_id=0&requests_per_worker=0&fanout=0');
		
	// 	const result = commonParams({ url });

	// 	expect(result.workerId).toBe(0);
	// 	expect(result.requestsPerWorker).toBe(2);
	// 	expect(result.fanoutCount).toBe(2);
	// });

	// it('should handle URL-encoded values', () => {
	// 	const url = new URL('http://example.com?target_url=http%3A//target.com/path%3Fparam%3Dvalue&sequence_id=seq%20with%20spaces');
		
	// 	const result = commonParams({ url });

	// 	expect(result.targetUrl).toBe('http://target.com/path?param=value');
	// 	expect(result.sequenceId).toBe('seq with spaces');
	// });
});
