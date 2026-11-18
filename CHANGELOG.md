# Changelog

## [0.6.3] - 2026-11-19

### Added
- Added OAuth 2.0 Protected Resource Metadata support according to RFC 9728.
- Added the `/.well-known/oauth-protected-resource/mcp` endpoint.
- Added resource metadata discovery information to OAuth MCP authentication challenges.

### Fixed
- Fixed OAuth MCP authentication challenges to include the `resource_metadata` parameter for protected resource discovery.
- Added validation of the protected resource metadata URL passed to the MCP server.
- Ensured the MCP child process is restarted when the public NodeBB URL changes.

### Testing
- Added tests for Protected Resource Metadata discovery and OAuth authentication challenges.
- Added tests for metadata URL validation and MCP manager configuration.
- Verified backward compatibility with Legacy Bearer authentication.


## [0.6.2] - 2026-11-17

### Added
- Added an OAuth 2.0 authorization server with Authorization Code flow and PKCE.
- Added Client ID Metadata Documents (CIMD) support for OAuth clients.
- Added an explicit user consent flow and automatic client registration after approval.
- Added MCP access management to the user profile, including global access control and per-client revocation.
- Added refresh token rotation and replay detection.
- Added OAuth storage adapters for Redis, MongoDB and PostgreSQL.

### Testing
- Redis storage adapter verified.
- MongoDB and PostgreSQL adapters implemented; live integration testing has not yet been performed.

### Security
- Added permission and grant validation for OAuth-authenticated MCP requests.
- Added immediate invalidation of existing access when global MCP access is disabled.


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
