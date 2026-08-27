#pragma once

#include <vector>
#include <limits>
#include "MatchExpression.h"
#include "../utils/TimeUtils.h"

/*
* 匹配boolean类型。表达式格式: Y/N，*表示通配符
*/
class BoolMatchExpression : public MatchExpression<bool> {
private:
	std::shared_ptr<bool> _isYes{ nullptr };

protected:
	bool ParseExpression(const std::string& expression) override {
		_isYes = (expression == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(expression == RuleParamConstant::YES);
		return true;
	}

	bool MatchImpl(const bool& matchable) const override {
		return _isYes == nullptr || *_isYes == matchable;
	}

public:
	BoolMatchExpression() : MatchExpression(MatchExpression::MatchType::MATCH_BOOL) {

	}

	bool Ignored() const override {
		return _isYes == nullptr;
	}

};