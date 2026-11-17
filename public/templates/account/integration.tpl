<div class="container">
    <div class="row">
        <div class="col-lg-8 col-lg-offset-2">
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h2 class="panel-title">{{tx("integration:account-title")}}</h2>
                </div>
                <div class="panel-body">
                    <p>
                        {{tx("integration:account-description")}}
                    </p>

                    <div class="panel panel-default">
                        <div class="panel-heading">
                            <h3 class="panel-title">{{tx("integration:account-mcp-access")}}</h3>
                        </div>
                        <div class="panel-body">
                            <!-- IF userAccessEnabled -->
                            <p class="text-success">
                                {{tx("integration:account-enabled")}}
                            </p>
                            <p>
                                {{tx("integration:account-enabled-description")}}
                            </p>
                            <form method="post" action="{config.relative_path}/user/{userslug}/integration/access">
                                <input type="hidden" name="_csrf" value="{config.csrf_token}" />
                                <input type="hidden" name="enabled" value="false" />
                                <button type="submit" class="btn btn-danger">
                                    {{tx("integration:account-disable")}}
                                </button>
                            </form>
                            <!-- ELSE -->
                            <p class="text-muted">
                                {{tx("integration:account-disabled")}}
                            </p>
                            <p>
                                {{tx("integration:account-disabled-description")}}
                            </p>
                            <form method="post" action="{config.relative_path}/user/{userslug}/integration/access">
                                <input type="hidden" name="_csrf" value="{config.csrf_token}" />
                                <input type="hidden" name="enabled" value="true" />
                                <button type="submit" class="btn btn-success">
                                    {{tx("integration:account-enable")}}
                                </button>
                            </form>
                            <!-- ENDIF -->
                        </div>
                    </div>

                    <h3>{{tx("integration:account-title")}}</h3>

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
                            <p class="text-success">{{tx("integration:account-access-enabled")}}</p>
                            <form method="post" action="{config.relative_path}/user/{userslug}/integration/revoke">
                                <input type="hidden" name="_csrf" value="{config.csrf_token}" />
                                <input type="hidden" name="clientId" value="{grants.clientId}" />
                                <button type="submit" class="btn btn-danger btn-sm">
                                    {{tx("integration:account-revoke")}}
                                </button>
                            </form>
                            <!-- ELSE -->
                            <p class="text-muted">{{tx("integration:account-revoked")}}</p>
                            <!-- ENDIF -->
                        </div>
                        <!-- END grants -->
                    </div>
                    <!-- ELSE -->
                    <p class="text-muted">{{tx("integration:account-none")}}</p>
                    <!-- ENDIF -->
                </div>
            </div>
        </div>
    </div>
</div>
