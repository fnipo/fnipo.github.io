# CrowdStrike — VirusTotal

# Solution Design Documentation

## Authors

| Name | Email |
|---|---|
| Felipe Nipo Ferreira | fpnipo@gmail.com |

---

## Overview

### Summary

This document describes the solution design for a VirusTotal-like file analysis platform integrated into CrowdStrike's ecosystem. The platform enables users to upload arbitrary files and have them analyzed by multiple antivirus engines, metadata extraction scripts, and behavioral analysis sandboxes. Results are aggregated and made available through both a web UI and a REST API.

The core challenge is coordinating many heterogeneous scanning engines — each with different runtimes, failure modes, and output schemas — in a scalable, resilient, and cost-effective way.

### Scope

- Users upload files to be scanned via UI or API.
- Uploaded files are analyzed by multiple antivirus engines and metadata extraction scripts.
- Engines and scripts perform operations such as:
  - Running a proprietary virus scanner.
  - Extracting metadata from file headers (e.g. PE headers, ELF headers, PDF metadata).
  - Making calls to external service endpoints (e.g. threat intelligence feeds, WHOIS lookups).
  - Executing uploaded files in an isolated sandbox to observe their behavior.
- The system stores metadata and antivirus results about uploaded files.
- Users can retrieve metadata about uploaded files (file attributes, extracted metadata, and per-engine AV results).
- All major features are available through both the UI and an API consumed by user-built applications.

### Out of Scope

- Building or maintaining the AV engines and sandbox implementations themselves (treated as black-box integrations).
- Long-term archival or compliance storage of raw files beyond a configurable retention window.
- Real-time streaming of in-progress scan results (results are delivered once all selected engines complete, or on a per-engine basis when polling).
- Multi-tenancy, billing, or quota management.

---

## Functional Requirements

1. **File Upload** — Users can upload files up to a defined maximum size via a REST endpoint or the web UI.
2. **Deduplication** — If the same file (determined by SHA-256 hash) has already been analyzed and the results are fresh, the system returns the cached results without re-scanning.
3. **Multi-engine Scanning** — Each uploaded file is dispatched to all registered scanning engines concurrently and independently.
4. **Result Aggregation** — Per-engine results are stored as they arrive; a composite report is accessible once all engines have responded or timed out.
5. **Result Retrieval** — Users can query scan results by file hash or a submission ID, returning structured metadata and per-engine verdicts.
6. **Status Polling** — When a scan is in progress, the API returns an appropriate status (`queued`, `in_progress`, `completed`, `failed`) so clients can poll for completion.
7. **API Access** — All functionality is exposed via a versioned REST API protected by API keys.
8. **UI Access** — A web interface allows unauthenticated file lookups (public hash search) and authenticated file submissions.

---

## Non-Functional Requirements

| Requirement | Target |
|---|---|
| **Upload Latency** | < 2 s p99 to acknowledge an upload and return a submission ID. |
| **Scan Throughput** | Support at least N concurrent scans (where N is configurable per deployment). |
| **Result Availability** | Results visible within seconds of an engine completing, with full report available once all engines finish. |
| **Availability** | ≥ 99.9% for the upload and query APIs. |
| **Durability** | Stored results must not be lost; files may be evicted after a configurable TTL. |
| **Scalability** | Engine workers scale horizontally and independently; adding a new engine requires no changes to core services. |
| **Security** | Files are stored encrypted at rest; all data in transit uses TLS; API keys are rotated regularly. |
| **Observability** | Every scan job emits structured logs and metrics; latency and error rates are monitored per engine. |

---

## Assumptions

1. Each AV engine exposes a consistent internal interface (e.g. a container image with a defined stdin/stdout contract or an HTTP endpoint), even though their internal implementations differ.
2. Engines are stateless and can be scaled horizontally; any engine worker can handle any scan job for that engine type.
3. Files are opaque byte streams from the platform's perspective — the platform does not parse or interpret file content itself.
4. A file's SHA-256 hash is a sufficient deduplication key for the purposes of caching results.
5. Engines may fail or time out; the platform must handle partial results gracefully.
6. The number of registered engines is relatively small (tens, not thousands) and changes infrequently.
7. Behavioral sandboxes are more expensive and slower than static analyzers; they may be run on a subset of files or triggered manually.

---

## Clarified Questions

| # | Question | Answer / Resolution |
|---|---|---|
| 1 | Should a re-scan be triggered if results exist but are older than a threshold? | Yes — results have a configurable TTL; expired results trigger a fresh scan on the next request. |
| 2 | Should the scan wait for all engines or return partial results? | The API returns partial results as engines complete; a `completed` status is set only when all engines respond or exceed the engine timeout. |
| 3 | Who can upload files — any authenticated user or only internal services? | Both; external users authenticate with API keys, internal services use service-to-service tokens. |
| 4 | How large can uploaded files be? | Maximum file size is 650 MB, matching the VirusTotal public API limit; this is configurable per deployment. |
| 5 | Are sandbox (behavioral analysis) runs mandatory? | No — sandbox runs are optional and more expensive; they are triggered on demand or by policy (e.g. when static engines return a verdict). |
| 6 | What happens when an engine is unavailable? | After a configurable timeout and retry policy, the engine's result slot is marked `timeout` and the overall scan proceeds without it. |

---

## Design

### Architectural Overview

![VirusTotal Solution Design Architecture](image1)

The architecture follows an **event-driven, fan-out** model. A file upload triggers a single submission event that is fanned out to all registered engine-specific queues. Engine workers consume from their dedicated queues, perform analysis, and write results back to a shared results store. A query service then assembles and serves the composite report.

The final design uses the following major components:

| Component | Technology (example) | Responsibility |
|---|---|---|
| **API Gateway** | e.g. AWS API Gateway / Nginx | TLS termination, auth, rate limiting, routing |
| **Upload Service** | Stateless microservice | Accepts uploads, deduplicates, emits scan events |
| **File Store** | Object storage (e.g. S3) | Stores raw file bytes, encrypted at rest, with a configurable TTL |
| **Metadata DB** | NoSQL (e.g. DynamoDB / Cassandra) | Stores file hashes, submission records, per-engine results |
| **Scan Bus** | Message queue (e.g. SQS / Kafka) | One queue (or topic) per engine; buffers scan jobs |
| **Engine Workers** | Containerised workers (one type per engine) | Pull jobs, invoke the engine, write results to Metadata DB |
| **Query Service** | Stateless microservice | Reads and aggregates results from Metadata DB, serves API responses |
| **Auth Service** | e.g. OAuth2 + API key store | Issues and validates tokens / API keys |

---

### Workflow

#### File Upload Flow

```
Client
  │
  ├─(1) POST /files  ─────────────────────────────────▶ API Gateway
  │                                                          │
  │                                               (2) Authenticate (API key / token)
  │                                                          │
  │                                                  Upload Service
  │                                                          │
  │                                         (3) SHA-256 hash of file
  │                                                          │
  │                                   ┌──── (4a) Hash found in DB? ────▶ Return cached submission ID
  │                                   │                     │
  │                             (4b) New file            (5) Write file to File Store (S3)
  │                                   │                     │
  │                                   └──────────(6) Write submission record to Metadata DB
  │                                                          │
  │                                   (7) Publish ScanRequested event per engine to Scan Bus
  │                                                          │
  └─(8) 202 Accepted { submission_id }  ◀────────────────────
```

#### Scan Processing Flow

```
Scan Bus (per-engine queue)
  │
  ├─(1) Engine Worker dequeues ScanRequested message
  │
  ├─(2) Downloads file from File Store
  │
  ├─(3) Invokes engine (virus scan / metadata extractor / sandbox)
  │
  ├─(4) Writes EngineResult to Metadata DB (result, verdict, engine version, timestamp)
  │
  └─(5) Publishes ScanCompleted event (optional, for real-time notifications)
```

#### Result Retrieval Flow

```
Client
  │
  ├─(1) GET /files/{hash}/report  ────────────────────▶ API Gateway
  │                                                          │
  │                                                  Query Service
  │                                                          │
  │                                     (2) Fetch submission + all engine results from Metadata DB
  │                                                          │
  │                                     (3) Assemble composite report
  │                                                          │
  └─(4) 200 OK { status, engines: [...] }  ◀────────────────
```

---

### Data Model

#### Submission Record

```json
{
  "file_hash":     "sha256:<hex>",
  "submission_id": "uuid",
  "submitted_at":  "ISO-8601 timestamp",
  "file_size":     12345,
  "file_name":     "example.exe",
  "status":        "queued | in_progress | completed | failed",
  "engines_total": 10,
  "engines_done":  7,
  "expires_at":    "ISO-8601 timestamp"
}
```

#### Engine Result Record

```json
{
  "file_hash":     "sha256:<hex>",
  "engine_id":     "crowdstrike-ml",
  "verdict":       "malicious | suspicious | clean | timeout | error",
  "confidence":    0.98,
  "details":       { /* engine-specific schema */ },
  "engine_version":"1.4.2",
  "scanned_at":    "ISO-8601 timestamp"
}
```

**Partition key:** `file_hash`
**Sort key:** `engine_id`

This schema is intentionally schema-less for the `details` field, accommodating the heterogeneous output of different engines without requiring schema migrations when new engines are added.

---

### Authentication & Authorization

- **API users** authenticate with long-lived API keys (rotated via a key-management service). Keys are scoped to permissions (read-only vs. submit).
- **Web UI users** authenticate via OAuth2 / OIDC (e.g. CrowdStrike SSO). Session tokens are short-lived.
- **Service-to-service** communication (e.g. Upload Service → File Store, Engine Workers → Metadata DB) uses IAM roles / service accounts with least-privilege policies.
- **Public hash lookups** (read-only) are allowed without authentication but are rate-limited.

---

### Performance

- **Upload acknowledgement** is fast because writing the file to object storage and publishing queue messages are the only synchronous operations; actual scanning is fully async.
- **Deduplication** short-circuits the full upload pipeline for known files, returning cached results at database-read latency.
- **Engine worker scaling** is independent per engine; a slow engine (e.g. sandbox) can scale out without affecting faster engines (e.g. static AV).
- **Query service** reads from the Metadata DB using the file hash as the primary key — O(1) lookup regardless of database size.
- **Caching** at the API Gateway layer can serve repeated reads of the same file hash without hitting the database, using a short TTL (e.g. 30 s) during active scans and a longer TTL (e.g. 1 h) for completed scans.

---

### Resiliency

| Failure Scenario | Handling Strategy |
|---|---|
| Engine worker crashes mid-scan | Message remains in queue (visibility timeout); another worker picks it up and retries. |
| Engine times out | After `engine_timeout_seconds`, the result slot is marked `timeout`; the overall scan is not blocked. |
| File Store temporarily unavailable | Upload Service returns 503; clients retry. Engine workers retry with exponential backoff before declaring failure. |
| Metadata DB write failure | Engine workers retry with exponential backoff; idempotent writes (same `file_hash` + `engine_id` = upsert). |
| Duplicate scan jobs published | Engine worker results are upserts; re-processing the same job is safe. |
| Entire region failure | Active-passive cross-region failover for the API layer; Metadata DB uses cross-region replication. |

**Dead-letter queues (DLQ):** Each engine queue has an associated DLQ. Messages that exceed the retry limit are moved to the DLQ and trigger an alert for manual investigation.

---

### Validation, Error Handling & User Messaging

- **File size validation** — Enforced at the API Gateway before the request reaches the Upload Service (HTTP 413 if exceeded).
- **MIME type sniffing** — The Upload Service performs magic-byte detection; files that cannot be classified are accepted but flagged in the submission record.
- **Malformed requests** — The API returns structured JSON error responses with a machine-readable `error_code` and a human-readable `message`.
- **Scan failures** — If all engines fail or time out for a submission, the submission status is set to `failed` and the error details are included in the report.
- **Rate limiting** — Enforced at the API Gateway; clients exceeding limits receive HTTP 429 with a `Retry-After` header.

---

## Key Design Decisions

### Decision 1: Asynchronous Scanning Over Synchronous

Scanning a file through multiple engines can take from a few seconds (static AV) to several minutes (behavioral sandbox). A synchronous HTTP response would require extremely long timeouts, is fragile over the internet, and creates poor UX.

**Decision:** Uploads return immediately with a `202 Accepted` and a `submission_id`. Clients poll for results or use webhooks (future).

**Trade-off:** Adds polling complexity on the client side, but is the standard approach for any long-running operation exposed over HTTP.

---

### Decision 2: Per-Engine Queues Over a Single Shared Queue

A single shared queue would require engine workers to filter messages for their engine type — wasting CPU on message filtering and coupling all workers to the same queue depth. With no isolation, a slow engine accumulating a deep backlog would delay visibility into overall scan queue depth and complicate per-engine scaling decisions.

**Decision:** Each engine has its own dedicated queue. The Upload Service publishes one message per engine per file.

**Trade-off:** More queues to manage (one per engine), but isolation means a backlog for the sandbox does not affect static AV response times.

---

### Decision 3: NoSQL Over Relational DB for Results

Engine results have heterogeneous schemas. A relational schema would require either a generic key-value `details` column (losing query ability) or a schema migration for every new engine.

**Decision:** Use a NoSQL document store (e.g. DynamoDB) with `file_hash` as the partition key and `engine_id` as the sort key.

**Trade-off:** Sacrifices strong relational guarantees, but the access pattern (lookup by hash, write per engine) is a perfect fit for a key-value / wide-column model.

---

### Decision 4: Object Storage for Raw Files

Files can be up to 650 MB. Storing them in the database would balloon costs and degrade query performance. Object storage is cheap, durable, and natively handles large blobs.

**Decision:** Raw file bytes go to object storage (e.g. S3); only the hash, metadata, and results go to the database.

**Trade-off:** Engine workers need an extra step to download the file from S3 before scanning, adding latency. This is acceptable because scanning is already async.

---

### Decision 5: SHA-256 Hash as Deduplication Key

Computing the SHA-256 hash of a file provides a strong deduplication guarantee with negligible collision probability. It also enables hash-based lookups (a common VirusTotal use case) without requiring a database scan.

**Decision:** SHA-256 hash is computed on upload and used as the primary key for all records.

**Trade-off:** Requires reading the entire file during upload to compute the hash. For very large files this adds latency on the upload path.

---

## Alternative Designs Considered

### Alternative 1: Synchronous Scanning (Request-Response)

**Description:** The upload endpoint streams the file to all engines synchronously and returns the complete report in the HTTP response.

#### Pros
- Simplest client interaction — one HTTP call returns full results.
- No polling or webhook infrastructure required.

#### Cons
- Long response times (seconds to minutes) are impractical over HTTP.
- A single engine timeout causes the entire request to time out for the client.
- Impossible to scale engines independently behind a synchronous call chain.
- Does not support sandbox analysis (runtimes of minutes to hours).

#### Trade-offs
Synchronous scanning trades simplicity for poor scalability, poor UX for slow engines, and inability to support heavyweight analyzers. Only viable for trivially fast engines on an internal network.

#### Decision
**Rejected.** The async fan-out model is the standard for multi-engine analysis platforms and is far better suited to the non-functional requirements.

---

### Alternative 2: Single Shared Scan Queue

**Description:** All engines consume from a single queue and use a `engine_id` field to filter messages they should process.

#### Pros
- Fewer queues to manage and monitor.
- Simpler publish logic in the Upload Service (one message per file).

#### Cons
- Workers spend CPU filtering irrelevant messages.
- Queue depth reflects the aggregate backlog of all engines; a slow engine starves fast engines.
- Scaling a single engine requires scaling all workers, which is wasteful.
- A DLQ would intermix failures from different engines.

#### Trade-offs
A shared queue reduces infrastructure complexity at the cost of engine isolation and operational clarity. For a small, homogeneous set of equally fast engines it can be acceptable; for a heterogeneous set with widely varying runtimes (static AV vs. sandbox), isolation is essential.

#### Decision
**Rejected.** Per-engine queues provide better isolation, independent scaling, and cleaner observability.

---

### Alternative 3: Relational Database for Results

**Description:** Use a PostgreSQL/MySQL schema with a normalised table for engine results, including a generic `JSONB` column for engine-specific fields.

#### Pros
- ACID transactions guarantee consistency between the submission record and engine results.
- Rich query capabilities (e.g. "find all files with a malicious verdict from engine X in the last 7 days").

#### Cons
- Schema migrations are required when adding new engines if any engine-specific fields need to be indexed.
- A `JSONB` catch-all column for details negates the benefits of a relational schema.
- Row-level locking under concurrent writes from many engine workers can become a bottleneck.

#### Trade-offs
A relational DB is the right choice when query flexibility and cross-record joins matter. For this system, the primary access pattern is "get all results for a given file hash" — a perfect key-value lookup. Complex reporting queries can be satisfied by an analytics layer (e.g. Athena over S3 exports) rather than burdening the operational DB.

#### Decision
**Rejected** for the operational results store. A NoSQL document store with `(file_hash, engine_id)` as the composite key is a better fit. Analytical queries are served from a separate reporting pipeline.

---

### Alternative 4: Monolithic Scanner Service

**Description:** A single service runs all engines sequentially or in parallel using threads/goroutines.

#### Pros
- Simplest operational model — one service to deploy, one set of logs.
- Low inter-service communication overhead.

#### Cons
- A crash in one engine integration can bring down all scanning.
- Cannot scale individual engines independently.
- Adding a new engine requires redeploying the entire monolith.
- Long-running engines (sandbox) block resources needed by fast engines.

#### Trade-offs
A monolith makes sense in early prototyping when there are only 2–3 engines and operational simplicity dominates. As the engine count and diversity grows, the costs of tight coupling outweigh the simplicity gains.

#### Decision
**Rejected.** The containerised, per-engine worker model enables independent deployment, independent scaling, and fault isolation without sacrificing the ability to share infrastructure.

---

## Manageability & Support

### Configuration & Feature Flags

- Engine registration (which engines are active, their timeout, and retry policy) is managed via a configuration service and takes effect without redeploying workers.
- Feature flags control:
  - Whether sandbox analysis is triggered automatically or only on demand.
  - Per-API-key rate limits.
  - Result TTL per engine type.

### Telemetry & Dashboards

Each component emits structured logs and metrics. Key metrics include:

| Metric | Component | Alert Threshold |
|---|---|---|
| `upload_latency_p99` | Upload Service | > 2 s |
| `queue_depth` | Scan Bus (per engine) | > configurable threshold |
| `engine_error_rate` | Engine Workers (per engine) | > 1% over 5 min |
| `scan_timeout_rate` | Engine Workers | > 5% over 5 min |
| `dlq_message_count` | DLQ (per engine) | > 0 |
| `api_error_rate_5xx` | API Gateway | > 0.1% over 5 min |

Dashboards show per-engine health, queue backlog trends, and end-to-end scan latency percentiles.

### Live Site, Monitoring & Incident Response

- **On-call runbooks** document the remediation steps for each alert (e.g. how to drain a DLQ, how to force-requeue a stuck submission).
- **Health endpoints** on every service are monitored by the load balancer; unhealthy instances are removed from rotation automatically.
- **Circuit breakers** on the Upload Service prevent cascading failures if the Metadata DB or File Store becomes unavailable.

---

## Trustworthiness

### Security

- **Encryption at rest** — Files in object storage are encrypted using AES-256 (SSE-S3 or customer-managed KMS keys). Metadata DB encryption is enabled at the cluster level.
- **Encryption in transit** — All internal and external communication uses TLS 1.2+.
- **API key management** — Keys are hashed before storage (never stored in plaintext). Rotation is enforced periodically; compromised keys can be revoked immediately.
- **Least-privilege IAM** — Each service has an IAM role granting only the permissions it needs (e.g. Engine Workers can read from S3 and write to DynamoDB but cannot call the upload endpoint).
- **File isolation** — Engine workers run in isolated containers. Behavioral sandbox workers run in dedicated VMs with no network access to internal systems.
- **Malicious file handling** — The platform itself does not execute uploaded files outside of the sandboxed engine workers. Workers are ephemeral and destroyed after each job.

### Privacy

- File content is not logged. Only the SHA-256 hash, size, submission ID, and metadata are present in logs.
- Files are automatically deleted from object storage after the configured retention period.
- Users can explicitly request deletion of their submissions via a DELETE API endpoint.

---

## Integration & Release Plan

### Engine Integration

New engines are integrated by:
1. Implementing the standard engine worker interface (pull job from queue, download file, run engine, write result).
2. Registering the engine in the configuration service.
3. Deploying the engine worker as a new container type.

No changes to core services (Upload Service, Query Service) are required to add a new engine.

### Rollout Strategy

- **Feature flags** gate access to new engines during shadow testing (engine runs but results are not surfaced to end users).
- **Canary deployments** are used for engine worker updates; a small percentage of traffic goes to the new version first.
- **Blue/green deployment** for the Upload and Query Services ensures zero-downtime updates.

### E2E Testing

- Integration tests submit known files (with known expected verdicts) and assert that the expected results are returned within the SLA.
- Contract tests validate the Upload Service's queue message schema against the Engine Worker's consumer expectations, ensuring compatibility when either side changes.
- Chaos tests periodically kill engine workers and DLQ-inject messages to verify the retry and timeout paths.
