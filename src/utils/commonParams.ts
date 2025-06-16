const commonParams = ({ url }: { url: URL }) => ({
	targetUrl: url.searchParams.get('target_url') ?? '',
	sequenceId: url.searchParams.get('sequence_id') ?? crypto.randomUUID(),
	workerId: url.searchParams.get('worker_id') ?? crypto.randomUUID(),
	requestsPerWorker: Math.max(1, Math.min(50, parseInt(url.searchParams.get('requests_per_worker') ?? '2'))),
	fanoutCount: Math.max(1, Math.min(100, parseInt(url.searchParams.get('fanout') ?? '2'))),
	selfUrl: url.origin + url.pathname,
})

export default commonParams
