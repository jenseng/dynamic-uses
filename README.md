# dynamic-uses

This action allows you to dynamically resolve and use other GitHub actions, despite `uses` [not supporting](https://github.com/actions/runner/issues/895) expression contexts like `inputs`, `github` or `env`.

This can be useful if you are authoring multiple dependent actions within a repo and need to be able to test them dynamically AND use them from outside the repo.

## Usage

Given a step like so:

```yaml
- uses: actions/setup-node@v3
  with:
    node-version: 18
```

If you want your `uses` to be dynamic you can do:

```yaml
- uses: jenseng/dynamic-uses@v1
  with:
    # now you can use expressions 🥳
    uses: actions/setup-node@${{ inputs.version }}
    # the `with` needs to be converted to a string (YAML mapping or JSON object)
    with: |
      node-version: 18
```

## Inputs

### `uses`

Action reference or path, e.g. `actions/setup-node@v3`. May contain expressions 🥳

### `with`

YAML/JSON string of `inputs` for the action, e.g. `node-version: 18` or `{"node-version": "18"}`. Defaults to `{}`.

Quoting can get tricky, so here are a couple tips to ensure your `with` inputs work safely and correctly:

#### 1. Use a multi-line string

For example, instead of this:

```yaml
# 👎 escape sequences, hard to read
with: "environment: test\ncluster: ''\nuser: John \"Reilly\" O'Reilly"
```

Prefer this:

```yaml
# 👍 simple, readable
with: |
  environment: test
  cluster: ""
  user: John "Reilly" O'Reilly
```

Since JSON is a subset of YAML, you can also specify `with` as a JSON object:

```yaml
# 👍 a literal JSON object
with: |
  {
    "environment": "test",
    "cluster": "",
    "user": "John \"Reilly\" O'Reilly"
  }
# 👍 a complete JSON object from somewhere else
with: ${{ toJSON(inputs) }}
```

#### 2. Use `toJSON` for anything dynamic

If you have any expressions in the `with` string, you should use `toJSON` to ensure they are handled correctly. This will protect against malicious user input (e.g. `github.event.pull_request.title`), as well as mistakes that can break quoting, indentation, or escape sequences (e.g. `env.trustedValueThatMightHaveQuotes`).

For example, instead of this:

```yaml
# 👎 an attacker could use a specially crafted PR title to inject additional inputs
with: |
  title: ${{ github.event.pull_request.title }}
  message: "Testing ${{ github.event.pull_request.title }}"
```

You should instead let `toJSON` handle the quoting/escaping:

```yaml
# 👍 all inputs are handled safely and correctly
with: |
  title: ${{ toJSON(github.event.pull_request.title) }}
  message: ${{ toJSON(format('Testing {0}', github.event.pull_request.title)) }}
```

### `env-outputs`

Whether to set an environment variable for each of the action's outputs. Defaults to `false`. For portability, all non-alphanumeric characters in the output name will be converted to underscores, and camel-cased output names will be converted to snake case. See [Outputs](#outputs) for more information. 

### `env-outputs-prefix`

Prefix to use for the output environment variable names. If set, the prefix will be applied along with an underscore, e.g. a prefix of `setup_node` and a `node_version` output will result in a `setup_node_node_version` environment variable. Implies `env-outputs: true`.

### `env-outputs-upcase`

Whether to capitalize environment variable names. Defaults to `false` (i.e. environment variables will be lower-cased). Implies `env-outputs: true` if set explicitly.

### `env-outputs-on-conflict`

Error handling behavior when an output environment variable conflicts with an existing variable of the same name. Defaults to `overwrite`. Possible values are:
- `overwrite`: Overwrite the existing environment variable, and emit a warning
- `preserve`: Preserve the existing envirironent variable, and emit a warning
- `error`: Emit an error and fail the action

## Outputs

### `outputs`

All outputs from the action will be serialized as a JSON object output named `outputs`. You can access specific outputs by using the `fromJSON` helper in an expression. For example:

```yaml
- id: setup_node
  uses: jenseng/dynamic-uses@v1
  with:
    uses: actions/setup-node@${{ inputs.version }}
    with: |
      node-version: 18
- env:
    # pull the node-version out of the outputs
    node_version: ${{ fromJSON(steps.setup_node.outputs.outputs).node-version }}
  run: echo "Installed $node_version"
```

If you find this too cumbersome to use, you can specify [`env-outputs: true`](#env-outputs) so that each output gets set as an environment variable. For example:

```yaml
- id: setup_node
  uses: jenseng/dynamic-uses@v1
  with:
    uses: actions/setup-node@${{ inputs.version }}
    with: |
      node-version: 18
    env-outputs: true # this will set a node_version env var for the node-version output
- run: echo "Installed $node_version"
```

Note that could potentially cause issues if the same variable names are being used elsewhere. To mitigate this and fully control how conflicts are handled, see [`env-outputs-prefix`](#env-outputs-prefix), [`env-outputs-upcase`](#env-outputs-upcase), and [`env-outputs-on-conflict`](#env-outputs-on-conflict).

## Why would I want to do this?

Maybe you don't, but there are legitimate use cases 🙂. For example, suppose `my-cool-org/repo` has a couple reusable actions that could either be used within the repo or from other repos:

**actions/cleanup/action.yml** - JavaScript action, details are irrelevant

**actions/deploy/action.yml** - Composite action:

```yaml
name: Deploy the stuff
inputs:
  stuffToDeploy:
    description: The stuff
runs:
  using: composite
  steps:
    - shell: bash
      env:
        stuffToDeploy: ${{ inputs.stuffToDeploy }}
      run: some-deploy-command "$stuffToDeploy"
    - uses: my-cool-org/repo/actions/cleanup@v3
      with:
        stuffToCleanUp: ${{ inputs.stuffToDeploy }}
```

Because the `uses` is hardcoded, it will always use `cleanup@v3`. This makes it challenging to test how `deploy` will work with a new version of `cleanup`, as you have to create and trigger one-off workflows to validate a new version before it lands. Ideally you could `use` a path instead, but that only works for workflows that have checked out `my-cool-org/repo`; the `deploy` action is much harder to reuse if you have to do that (i.e. imagine these actions are used by various other repos in the `my-cool-org` org).

Taking our example above, we can make it work however we need to with `dynamic-uses`:

```yaml
- uses: jenseng/dynamic-uses@v1
  env:
    action_ref: ${{ github.action_ref }}
  with:
    # ensure we use the right version:
    #  - within this repo, we want the `sha`
    #  - from outside the repo, we want the `action_ref`
    #    (we pass it through env, otherwise it picks up `v1` from `jenseng/dynamic-uses@v1`)
    uses: my-cool-org/repo/actions/cleanup@${{ github.repository == 'my-cool-org/repo' && github.sha || env.action_ref }}
    with: |
      stuffToCleanUp: ${{ toJSON(inputs.stuffToDeploy) }} }
```

## How does it work?

It turns out it's actually [pretty simple](./action.yml). It's just a composite action that generates a local composite action based on the inputs, and then runs it.

Because it's a local action, the runner software doesn't try to load it until immediately before it runs it. This lets us do anything dynamic that we need 😅

## Gotchas/limitations

- The `with` inputs to the action need to be converted to a YAML mapping string. See [these examples](#with) for more information.
- All outputs from the action will be serialized as a JSON object output named `outputs`. See [Outputs](#outputs) for more information.
- GitHub Actions has several bugs impacting nested composite actions (e.g. https://github.com/actions/runner/issues/2800, https://github.com/actions/runner/issues/2009). When you use dynamic-uses to call another composite action, these bugs can cause problems like blank/wrong `inputs` or `ouputs` within that action. As a workaround, you can try passing data along with `GITHUB_ENV` instead.

## License

The scripts and documentation in this project are released under the [ISC License](./LICENSE.md)
