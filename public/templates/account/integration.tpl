<div class="container">
    <div class="row">
        <div class="col-lg-8 col-lg-offset-2">
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h2 class="panel-title">Connected applications</h2>
                </div>
                <div class="panel-body">
                    <p>
                        Applications authorized to access your forum account
                        through MCP are listed below.
                    </p>

                    <div class="panel panel-default">
                        <div class="panel-heading">
                            <h3 class="panel-title">MCP account access</h3>
                        </div>
                        <div class="panel-body">
                            <!-- IF userAccessEnabled -->
                            <p class="text-success">
                                MCP access is enabled for your account.
                            </p>
                            <p>
                                Connected applications can access your account
                                according to their individual permissions.
                            </p>
                            <form method="post" action="{config.relative_path}/user/{userslug}/integration/access">
                                <input type="hidden" name="_csrf" value="{config.csrf_token}" />
                                <input type="hidden" name="enabled" value="false" />
                                <button type="submit" class="btn btn-danger">
                                    Disable MCP access
                                </button>
                            </form>
                            <!-- ELSE -->
                            <p class="text-muted">
                                MCP access is disabled for your account.
                            </p>
                            <p>
                                No connected application can access your account.
                                Enabling access again will require applications
                                to authorize again.
                            </p>
                            <form method="post" action="{config.relative_path}/user/{userslug}/integration/access">
                                <input type="hidden" name="_csrf" value="{config.csrf_token}" />
                                <input type="hidden" name="enabled" value="true" />
                                <button type="submit" class="btn btn-success">
                                    Enable MCP access
                                </button>
                            </form>
                            <!-- ENDIF -->
                        </div>
                    </div>

                    <h3>Connected applications</h3>

                    <!-- IF grants.length -->
                    <div class="list-group">
                        <!-- BEGIN grants -->
                        <div class="list-group-item">
                            <h4 class="list-group-item-heading">
                                {grants.clientName}
                            </h4>
                            <p class="list-group-item-text text-muted">
                                {grants.clientId}
                            </p>

                            <!-- IF grants.enabled -->
                            <p class="text-success">Access enabled</p>
                            <form method="post" action="{config.relative_path}/user/{userslug}/integration/revoke">
                                <input type="hidden" name="_csrf" value="{config.csrf_token}" />
                                <input type="hidden" name="clientId" value="{grants.clientId}" />
                                <button type="submit" class="btn btn-danger btn-sm">
                                    Revoke access
                                </button>
                            </form>
                            <!-- ELSE -->
                            <p class="text-muted">Access revoked</p>
                            <!-- ENDIF -->
                        </div>
                        <!-- END grants -->
                    </div>
                    <!-- ELSE -->
                    <p class="text-muted">No connected applications.</p>
                    <!-- ENDIF -->
                </div>
            </div>
        </div>
    </div>
</div>
