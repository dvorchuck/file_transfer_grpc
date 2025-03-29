# file_transfer_grpc

## Startup

- run `npm run start:server`
- run `npm run start:client` in other command line to start the file synchronization.
- Files are stored in `storage-client` and `storage-server`. Feel free to change the files too try the behavior.

The synchronization does not listen to changes in the file system. You neeed to run `npm run start:client` again to sync again.

## TODO

- delete empty folders in client after syncing
