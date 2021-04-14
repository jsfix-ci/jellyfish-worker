# Jellyfish Worker

Jellyfish workers are in charge of consuming action requests from the queue,
executing them, and reporting back the results. This module provides an lower
level interface to write a worker server. The intention is that we can write
multiple types of workers, optimised for different tasks using a single shared
framework.

# Usage

Below is an example how to use this library:

```js
const Worker = require('@balena/jellyfish-worker')

const worker = new Worker(jellyfish, jellyfish.sessions.admin, actionLibrary, consumer)
await worker.initialize(context)

const id = worker.getId()
console.log(`Worker ID: ${worker.getId()}`)
```

# Documentation

[![Publish Documentation](https://github.com/product-os/jellyfish-worker/actions/workflows/publish-docs.yml/badge.svg)](https://github.com/product-os/jellyfish-worker/actions/workflows/publish-docs.yml)

Visit the website for complete documentation: https://product-os.github.io/jellyfish-worker
