.PHONY: emu-up emu-test emu-down

emu-up:
	docker compose up -d --build emulator

emu-test:
	docker compose run --rm --build tests

emu-down:
	docker compose down --volumes
