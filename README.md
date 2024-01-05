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
    # the `with` needs to be converted to a valid json string
    with: '{ "node-version": 18 }'
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
steps:
  - shell: bash
    run: 'some-deploy-command "${{ inputs.stuffToDeploy }}"'
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
    uses: my-cool-org/repo/actions/cleanup@${{ github.repo == 'my-cool-org/repo' && github.sha || env.action_ref }}
    with: '{ "stuffToCleanUp": "${{ inputs.stuffToDeploy }}" }'
```

## How does it work?

It turns out it's actually [pretty simple](./action.yml). Basically we have a composite action that generates another composite action based on the inputs, and then runs it.

Because the action is referenced by path, it satisfies the parser. By the time it's ready to execute that step, the action file exists and is ready to run 😅

## Gotchas/limitations

- The `with` inputs to the action need to be converted to a single JSON object string (see examples above)
- Any outputs from the action will be serialized into a single `outputs` JSON object string. You can then access things using helpers like `fromJSON`, e.g. `fromJSON(steps.foo.outputs.outputs).something`

## License

The scripts and documentation in this project are released under the [ISC License](./LICENSE.md)
