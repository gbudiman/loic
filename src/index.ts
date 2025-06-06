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

type TRequestResult = {
	startsAt: number;
	workerId: number;
	requestId: number;
	sequenceId: string;
	successful: boolean;
	status: number;
	result: unknown;
}

interface Env {
	target_url: string;
	service_token: string;
	loic_token: string;
}

const commonParams = ({ url }: { url: URL }) => ({
	sequenceId: url.searchParams.get('sequence_id') ?? crypto.randomUUID(),
	workerId: Number(url.searchParams.get('worker_id')),
	requestsPerWorker: parseInt(url.searchParams.get('requests_per_worker') ?? '2'),
	fanoutCount: parseInt(url.searchParams.get('fanout') ?? '2'),
	selfUrl: url.origin + url.pathname,
})

const executeAsParent = async({ url, token }: { url: URL, token: string }) => {
	const { fanoutCount, requestsPerWorker, sequenceId, selfUrl } = commonParams({ url })
	const launches = Array.from({ length: fanoutCount}, (_, i) =>
		fetch(
			`${selfUrl}?mode=child&requests_per_worker=${requestsPerWorker}&token=${token}&worker_id=${i}&sequence_id=${sequenceId}`, 
			{ 
				method: 'POST',
				headers: {
					"X-Service-Token": token
				}
			}
		).then(async res => {
			const workerResult: { requestResults: TRequestResult[] } = await res.json()

			return {
				workerId: i,
				workerResult
			}
		})
	)

	const sessionResults = await Promise.all(launches)
	const flattenedResults = sessionResults.map(worker => worker.workerResult.requestResults).flat()
	return new Response(JSON.stringify({
		requestsSucceeded: flattenedResults.filter(r => r.successful).length,
		requestsFailed: flattenedResults.filter(r => !r.successful).length,
		totalRequests: flattenedResults.length,
		flattenedResults: flattenedResults.sort((a, b) => a.startsAt - b.startsAt),
	}))
}

const executeAsChild = async({ url, env, token }: { url: URL, env: Env, token: string }) => {
	const { workerId, requestsPerWorker, sequenceId } = commonParams({ url })
	const launches = Array.from({ length: requestsPerWorker }, (_, i) => {
		const startsAt = performance.now()

		return fetch(env.target_url, {
			method: 'POST',
			headers: {
				"Content-Type": "application/json",
				"X-Request-ID": String(i),
				"X-Worker-ID": String(workerId),
				"X-Sequence-ID": sequenceId,
				"X-LOIC-Service-Token": env.loic_token,
			}
		}).then(async res => {
			const result = await res.json()

			return {
				startsAt,
				workerId: workerId,
				requestId: i,
				sequenceId: sequenceId,
				successful: res.ok,
				status: res.status,
				result: result
			} as TRequestResult
		}).catch(err => {
			return {
				startsAt,
				workerId: workerId,
				requestId: i,
				sequenceId: sequenceId,
				successful: false,
				status: err.status,
				result: err.message
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

		return (mode === 'child') ? executeAsChild({url, token, env}) : executeAsParent({ url, token})
	},
} satisfies ExportedHandler<Env>;
