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
    with: '{ "stuffToCleanUp": ${{ toJSON(inputs.stuffToDeploy) }} }'
```

## How does it work?

It turns out it's actually [pretty simple](./action.yml). Basically we have a composite action that generates another composite action based on the inputs, and then runs it.

Because the action is referenced by path, it satisfies the parser. By the time it's ready to execute that step, the action file exists and is ready to run 😅

## Specifying `with` inputs

JSON and quoting can get tricky, so here are some tips to ensure your `with` inputs work safely and correctly:

### Use a multi-line string

By using a multi-line string, you can keep things fairly manageable, and dealing with quotes or special characters gets a lot easier.

For example, instead of this:

```yaml
with: '{ "environment": "test", "cluster": "", "user": "Reilly O\'Reilly" }'
```


Prefer this:

```yaml
with: |
  {
    "environment": "test",
    "cluster": "",
    "user": "Reilly O'Reilly"
  }
```

### Use `toJSON` for anything dynamic

If you have dynamic bits you are including in the `with` string, you should use `toJSON` to ensure they are handled correctly. This will protect against malicious user input (e.g. `github.event.pull_request.title`), as well as mistakes that can break quoting (e.g. `env.trustedValueThatMightHaveQuotes`).

For example, instead of this:

```yaml
with: |
  {
    "title": "${{ github.event.pull_request.title }}",
    "message": "Testing ${{ github.event.pull_request.title }}"
  }

```

You should instead let `toJSON` handle the quoting/escaping:

```yaml
with: |
  {
    "title": ${{ toJSON(github.event.pull_request.title) }},
    "message": ${{ toJSON(format('Testing {0}', github.event.pull_request.title)) }}
  }

```


## Gotchas/limitations

- The `with` inputs to the action need to be converted to a single JSON object string (see examples above)
- Any outputs from the action will be serialized into a single `outputs` JSON object string. You can then access things using helpers like `fromJSON`, e.g. `fromJSON(steps.foo.outputs.outputs).something`
- GitHub Actions has several bugs impacting nested composite actions (e.g. https://github.com/actions/runner/issues/2800, https://github.com/actions/runner/issues/2009). When you use dynamic-uses to call another composite action, these bugs can cause problems like blank/wrong `inputs` or `ouputs` within that action. As a workaround, you can try passing data along with `GITHUB_ENV` instead.

## License

The scripts and documentation in this project are released under the [ISC License](./LICENSE.md)
