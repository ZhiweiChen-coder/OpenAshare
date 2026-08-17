import pytest

from api.credits import CreditError, CreditService, estimate_request_cost, final_request_cost
from api.supabase_store import SupabaseStoreError


def test_credit_estimate_follows_user_intent_without_forcing_routing():
    assert estimate_request_cost("看看海光信息最近消息") == 2
    assert estimate_request_cost("分析 sh600036") == 4
    assert estimate_request_cost("分析我的持仓并结合世界局势") == 8
    assert estimate_request_cost("你好") == 1


def test_credit_settlement_uses_actual_agent_intent():
    assert final_request_cost("news_lookup") == 2
    assert final_request_cost("stock_analysis") == 4
    assert final_request_cost("portfolio_analysis") == 8
    assert final_request_cost("error") == 0


@pytest.mark.parametrize(
    ("detail", "expected"),
    [
        ("Supabase 数据请求失败: {\"code\":\"42702\",\"message\":\"column reference \\\"balance\\\" is ambiguous\"}", "字段歧义"),
        ("Supabase 数据请求失败: {\"code\":\"PGRST202\",\"message\":\"Could not find the function\"}", "扣费函数未生效"),
        ("Supabase 数据请求失败: {\"code\":\"42501\",\"message\":\"permission denied\"}", "函数权限不足"),
        ("Supabase 数据请求失败: {\"code\":\"42P01\",\"message\":\"relation does not exist\"}", "表结构不完整"),
    ],
)
def test_credit_rpc_errors_are_actionable(detail, expected):
    with pytest.raises(CreditError, match=expected):
        CreditService._raise_rpc_error(SupabaseStoreError(detail))
