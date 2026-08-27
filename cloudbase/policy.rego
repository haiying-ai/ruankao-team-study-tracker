package authz.user

default allow := false

allow if {
  input.cloudbase.resource_type == "functions"
  startswith(input.request.path, "/api")
  input.request.method == "OPTIONS"
}

allow if {
  input.cloudbase.resource_type == "functions"
  startswith(input.request.path, "/v1/functions/api")
  input.request.method == "OPTIONS"
}

allow if {
  input.cloudbase.resource_type == "functions"
  startswith(input.request.path, "/api")
  input.request.header_map["X-Team-Proof"] == "__TEAM_CODE_SHA256__"
}

allow if {
  input.cloudbase.resource_type == "functions"
  startswith(input.request.path, "/v1/functions/api")
  input.request.header_map["X-Team-Proof"] == "__TEAM_CODE_SHA256__"
}

deny contains "team verification required" if {
  input.cloudbase.resource_type == "functions"
  startswith(input.request.path, "/api")
  input.request.method != "OPTIONS"
  not input.request.header_map["X-Team-Proof"] == "__TEAM_CODE_SHA256__"
}

deny contains "team verification required" if {
  input.cloudbase.resource_type == "functions"
  startswith(input.request.path, "/v1/functions/api")
  input.request.method != "OPTIONS"
  not input.request.header_map["X-Team-Proof"] == "__TEAM_CODE_SHA256__"
}
