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
- uses: jenseng/dynamic-uses@v2
  with:
    # the `uses` input supports expressions 🥳, and determines which dynamic action will run
    uses: actions/setup-node@${{ inputs.version }}
    # any other inputs will be passed along to the dynamic action
    node-version: 18
```

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
- uses: jenseng/dynamic-uses@v2
  env:
    action_ref: ${{ github.action_ref }}
  with:
    # ensure we use the right version:
    #  - within this repo, we want the `sha`
    #  - from outside the repo, we want the `action_ref`
    #    (we pass it through env, otherwise it picks up `v2` from `jenseng/dynamic-uses@v2`)
    uses: my-cool-org/repo/actions/cleanup@${{ github.repository == 'my-cool-org/repo' && github.sha || env.action_ref }}
    stuffToCleanUp: ${{ inputs.stuffToDeploy) }}
```

## How does it work?

It turns out it's actually [pretty simple](./action.yml). Basically we have a composite action that generates another composite action based on the inputs, and then runs it.

Because the action is referenced by path, it satisfies the parser. By the time it's ready to execute that step, the action file exists and is ready to run 😅

## Gotchas/limitations

### `uses` gets passed along

The `uses` input gets passed along to the dynamically called action. This is generally not an issue, since unexpected inputs are ignored. If the action expects a `uses` input of its own, or if for some other reason this proves problematic, there are a couple workarounds:
1. Specify `$uses` instead of `uses`. dynamic-uses also accepts this input name, and it is much less likely to conflict, e.g.
    ```yaml
    - uses: jenseng/dynamic-uses@v2
      with:
        $uses: some/action@${{ inputs.version }}
        uses: this gets passed to some/action
    ```
1. Use [dynamic-uses@v1](https://github.com/jenseng/dynamic-uses/tree/v1) to fully specify all inputs via the `with` input, so that you avoid passing in anything extra, e.g.
    ```yaml
    - uses: jenseng/dynamic-uses@v1
      with:
        uses: some/action@${{ inputs.version }}
        with: '{ "uses": "this gets passed to some/action" }'
    ```

### Accessing `outputs`
All outputs from the action will be serialized as a JSON object output named `outputs` . You can access specific outputs by using the `fromJSON` helper in an expression. For example:

```yaml
- id: setup_node
  uses: jenseng/dynamic-uses@v2
  with:
    uses: actions/setup-node@${{ inputs.version }}
    node-version: 18
- env:
    # pull the node-version out of the outputs
    node_version: ${{ fromJSON(steps.setup_node.outputs.outputs).node-version }}
  run: echo "Installed $node_version"
```

### Blank/wrong `inputs` and `outputs`

GitHub Actions has several bugs impacting nested composite actions (e.g. https://github.com/actions/runner/issues/2800, https://github.com/actions/runner/issues/2009). When you use dynamic-uses to call another composite action, these bugs can cause problems like blank/wrong `inputs` or `ouputs` within that action. As a workaround, you can try passing data along with `GITHUB_ENV` instead.

## License

The scripts and documentation in this project are released under the [ISC License](./LICENSE.md)
