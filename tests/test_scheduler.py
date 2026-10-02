import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import scheduler


def test_schedule_fire_runs_callback_and_persists_status(tmp_path, caplog):
    schedules_file = tmp_path / 'schedules.json'
    schedule = {
        'id': 'hourly-drift',
        'name': 'Hourly drift check',
        'cronExpr': '0 * * * *',
        'enabled': True,
        'lastRun': None,
        'lastStatus': None,
    }
    schedules_file.write_text(json.dumps([schedule]), encoding='utf-8')
    fired = []
    engine = scheduler.ScheduleEngine(
        schedules_file,
        lambda item: fired.append(item['id']) or 'matched',
    )

    with caplog.at_level(logging.INFO, logger='ztf'):
        engine._fire(schedule)

    stored = json.loads(schedules_file.read_text(encoding='utf-8'))[0]
    record = next(record for record in caplog.records if record.msg == 'schedule_fire')
    assert fired == ['hourly-drift']
    assert stored['lastStatus'] == 'matched'
    assert stored['lastRun']
    assert record.schedule_name == 'Hourly drift check'


def test_drift_detection_presets_use_scheduler_weekday_numbering():
    source = (Path(__file__).resolve().parents[1] / 'src' / 'pages' / 'DriftDetection.tsx').read_text(encoding='utf-8')

    assert "{ label: 'Weekdays 06:00', value: '0 6 * * 0-4' }" in source
    assert "{ label: 'Sunday 03:00', value: '0 3 * * 6' }" in source
    assert "{ label: 'Weekdays 06:00', value: '0 6 * * 1-5' }" not in source
    assert "{ label: 'Sunday 03:00', value: '0 3 * * 0' }" not in source


def test_polling_cron_matches_drift_weekday_presets_on_expected_days():
    monday = datetime(2026, 9, 21, 6, 0, tzinfo=timezone.utc)
    friday = datetime(2026, 9, 25, 6, 0, tzinfo=timezone.utc)
    saturday = datetime(2026, 9, 26, 6, 0, tzinfo=timezone.utc)
    sunday = datetime(2026, 9, 27, 3, 0, tzinfo=timezone.utc)

    assert scheduler._cron_matches('0 6 * * 0-4', monday)
    assert scheduler._cron_matches('0 6 * * 0-4', friday)
    assert not scheduler._cron_matches('0 6 * * 0-4', saturday)
    assert scheduler._cron_matches('0 3 * * 6', sunday)
    assert not scheduler._cron_matches('0 3 * * 6', monday.replace(hour=3))


def test_apscheduler_cron_trigger_matches_drift_weekday_presets_on_expected_days():
    weekdays = scheduler._CronTrigger(
        minute='0',
        hour='6',
        day='*',
        month='*',
        day_of_week='0-4',
        timezone='UTC',
    )
    sunday = scheduler._CronTrigger(
        minute='0',
        hour='3',
        day='*',
        month='*',
        day_of_week='6',
        timezone='UTC',
    )

    next_weekday = weekdays.get_next_fire_time(
        None,
        datetime(2026, 9, 20, 7, 0, tzinfo=timezone.utc),
    )
    next_sunday = sunday.get_next_fire_time(
        None,
        datetime(2026, 9, 21, 7, 0, tzinfo=timezone.utc),
    )

    assert next_weekday == datetime(2026, 9, 21, 6, 0, tzinfo=timezone.utc)
    assert next_sunday == datetime(2026, 9, 27, 3, 0, tzinfo=timezone.utc)
