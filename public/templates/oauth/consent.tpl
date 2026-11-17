<div class="container">
    <div class="row">
        <div class="col-lg-8 col-lg-offset-2">
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h2 class="panel-title">MCP access authorization</h2>
                </div>
                <div class="panel-body">
                    <!-- IF errorMessage -->
                    <div class="alert alert-danger" role="alert">
                        {errorMessage}
                    </div>
                    <!-- ELSE -->
                    <h3>Allow access?</h3>

                    <p>
                        <strong>{clientName}</strong> is requesting permission
                        to access your forum through the Model Context Protocol (MCP).
                    </p>

                    <p>
                        Requested permissions:
                        <strong>{scopeLabels}</strong>
                    </p>

                    <p>
                        If you approve, this client will be authorized to act
                        with your forum account permissions. You can revoke
                        this authorization later in your account settings.
                    </p>

                    <form method="post" action="{config.relative_path}/oauth/consent">
                        <input type="hidden" name="_csrf" value="{config.csrf_token}" />
                        <input type="hidden" name="transaction" value="{transactionId}" />

                        <div class="btn-toolbar">
                            <button
                                type="submit"
                                class="btn btn-primary"
                                name="decision"
                                value="approve"
                            >
                                Allow access
                            </button>

                            <button
                                type="submit"
                                class="btn btn-default"
                                name="decision"
                                value="deny"
                            >
                                Deny
                            </button>
                        </div>
                    </form>
                    <!-- ENDIF -->
                </div>
            </div>
        </div>
    </div>
</div>
