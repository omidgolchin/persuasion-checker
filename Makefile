# Dev shortcuts. CI (.github/workflows/ci.yml) does the same steps without make.
.PHONY: venv test js-check data analyze eval serve

venv:
	python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt

test: venv
	.venv/bin/python -m pytest -q

js-check:
	node --check docs/app.js && node --check docs/persuasion.js && node --check docs/assist-config.js && node --check docs/tool-common.js && node --check scripts/eval_assist.js && node --check scripts/page_check.js

data:
	.venv/bin/python scripts/download_data.py && .venv/bin/python -m src.persuasion.build_pairs

analyze:
	.venv/bin/python -m src.persuasion.train && .venv/bin/python scripts/build_examples.py && node scripts/build_testset.js

eval:
	node scripts/eval_assist.js

serve:
	cd docs && python3 -m http.server 8000
