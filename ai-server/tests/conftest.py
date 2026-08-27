import pytest
from src.regression.store import RegressionStore


@pytest.fixture(autouse=True)
def _isolate_regression_store(tmp_path, monkeypatch):
    import src.regression.routes as rroutes
    monkeypatch.setattr(rroutes, 'store', RegressionStore(tmp_path / 'regression_tests.json'))
