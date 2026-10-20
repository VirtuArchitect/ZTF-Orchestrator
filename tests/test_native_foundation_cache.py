import contextvars

import pytest


def test_standalone_review_reuses_nested_work_and_isolates_results():
    import server

    calls = []

    def plan(value):
        calls.append(value)
        return {'items': [value]}

    cached = server._native_foundation_memoized_packet_helper('plan', plan)

    def review(value):
        first = cached(value)
        first['items'].append('changed')
        return cached(value), cached(value + 1)

    review = server._native_foundation_memoized_packet_helper('review', review)
    assert review(1) == ({'items': [1]}, {'items': [2]})
    assert calls == [1, 2]
    assert server._NATIVE_FOUNDATION_PACKET_CACHE.get() is None
    assert review(1) == ({'items': [1]}, {'items': [2]})
    assert calls == [1, 2, 1, 2]


def test_review_cache_cleans_up_after_exception():
    import server

    scopes = []

    def fail():
        scopes.append(server._NATIVE_FOUNDATION_PACKET_CACHE.get())
        raise ValueError('review failed')

    review = server._native_foundation_memoized_packet_helper('fail', fail)
    for _ in range(2):
        with pytest.raises(ValueError, match='review failed'):
            review()
        assert server._NATIVE_FOUNDATION_PACKET_CACHE.get() is None
    assert scopes[0] is not scopes[1]


def test_review_cache_preserves_parent_scope_and_isolates_independent_context():
    import server

    calls = []

    def compute():
        calls.append(len(calls))
        return calls[-1]

    review = server._native_foundation_memoized_packet_helper('compute', compute)
    parent = {}
    token = server._NATIVE_FOUNDATION_PACKET_CACHE.set(parent)
    try:
        assert review() == review() == 0
        assert contextvars.Context().run(review) == 1
        assert server._NATIVE_FOUNDATION_PACKET_CACHE.get() is parent
        assert review() == 0
    finally:
        server._NATIVE_FOUNDATION_PACKET_CACHE.reset(token)
    assert review() == 2
