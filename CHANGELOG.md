# Changelog

## [0.6.1] - 2026-11-12

### Fixed
- Fixed MCP API requests with empty request bodies and GET/HEAD methods.
- Fixed forum URL retrieval in `get_forum_info` using NodeBB configuration.
- Fixed default language retrieval in `get_forum_info`.
- Fixed category ID retrieval in `get_post` by using the associated topic data.
- Improved handling of missing or deleted topics when retrieving posts.


All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to Semantic Versioning.

## [0.6.0] - 2026-11-11

### Added
- Expanded the MCP server to provide 15 tools for interacting with NodeBB.
- Added topic and post creation and editing operations.
- Added soft-delete and restore operations for topics and posts.
- Added bulk deletion of a user's posts.
- Added paginated topic and post listing.
- Added API route tests and expanded MCP tool tests.

### Changed
- Improved NodeBB permission checks for operations performed through the integration.
- Improved request validation, authorization and error handling in API routes.
- Improved handling of NodeBB topics, posts and users.
- Updated MCP server version information to `0.6.0`.
- Updated documentation for NodeBB 4.x and Node.js >= 22.

### Fixed
- Improved handling of individual failures during bulk post deletion.
- Clarified pagination metadata so `hasMore` is treated as an estimate based on NodeBB's total count, not a guarantee that the next page contains results.
