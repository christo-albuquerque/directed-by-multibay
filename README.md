# DirectedByMultiBay

A living 3D factory on the planet **Kepler-22b** that visualizes real GitHub Actions builds and releases across multiple repositories. Tiny grain workers haul dependencies, run build machines, stress-test products and launch releases into orbit. When nothing is running, everybody takes a ramen break.

Live site: https://christo-albuquerque.github.io/directed-by-multibay/

The full design lives in [SPEC.md](SPEC.md). Everything is generated in code: no third-party models, textures, fonts or audio. Dependencies must be permissive-licensed (checked in CI).

## Using it

- **Live data:** the page polls GitHub Actions for your repos and turns every run into a product on the belt. Click a
  product (or a run in the top-left list) to see where it is and every step.
- **Several repos, one factory:** each repo gets its own bay, launchpad, rescue crew and workers, all sharing one planet
  and break plaza. Add or remove repos with **📂 Repos** (up to 4). Your list is saved in this browser. You can also use
  `?repos=owner/a,owner/b` in the URL, or change the shipped default in `public/repos.json`.
- **Rate limit:** without a token GitHub allows 60 API requests an hour, so updates slow down. **🔑 Token** takes an
  optional read-only token (kept only in this browser, sent only to api.github.com) for 5000 an hour.
- **Demo Panel:** force every state without GitHub (pick the demo bay from the dropdown when there are several).
- The demo project whose runs feed the default bay is [multibay-testlot](https://github.com/christo-albuquerque/multibay-testlot).

## Develop

```bash
npm install
npm run dev
```

## License

MIT. See [LICENSE](LICENSE).
