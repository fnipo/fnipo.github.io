var store = [{
        "title": "Partial execution: At-most-once vs. At-least-once Deliveries",
        "excerpt":"A workflow inside a microservice typically writes stuff to a database and produces a message or API request to another service. What if some infrastructure component goes down during the workflow execution and it can’t complete? The beginning of the workflow may execute, but some parts at the end may...","categories": ["distributed-systems"],
        "tags": ["distributed-systems"],
        "url": "/distributed-systems/2022/06/16/partial-execution-at-most-once-vs-at-least_once-deliveries.html",
        "teaser": null
      },{
        "title": "Solving Dual-writes: Change Data Capture, The Outbox Pattern, and Event Sourcing",
        "excerpt":"The dual-writes pattern is anytime a workflow has to write to two or more storages while not leveraging any transaction isolation. This is typically used on systems that can’t compromise availability with locking strategies such as Two Phase Commit. As explained in the Partial execution: At-most-once vs. At-least-once Deliveries post,...","categories": ["distributed-systems"],
        "tags": ["distributed-systems"],
        "url": "/distributed-systems/2022/06/17/solving-dual-writes-with-cdc-and-the-outbox-pattern.html",
        "teaser": null
      }]
