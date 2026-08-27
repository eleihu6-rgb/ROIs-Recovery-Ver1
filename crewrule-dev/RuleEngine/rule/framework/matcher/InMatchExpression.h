#pragma once

#include <vector>
#include "MatchExpression.h"
#include "UtilFunc.h"

template<typename T>
class InMatchExpression : public MatchExpression<T> {
private:
	std::vector<std::string> _values{};

protected:
	virtual bool ParseExpression(const std::string& expression) override {
		if (expression == RuleParamConstant::ALL) {
			return true;
		}
		split(expression, '|', _values);
		return true;
	}

	virtual bool MatchImpl(const T& matchable) const override {
		std::vector<std::string> matchableItems = GetMatchableItems(matchable);
		if (matchableItem.empty()) {
			return false;
		}
		for (auto& item : matchableItems) {
			auto iter = std::find(_values.cbegin(), _values.cend(), *matchableItem);
			if (iter != _values.cend()) {
				return true;
			}
		}
		return false;
	}

	virtual std::vector<std::string> GetMatchableItems(const T& matchable) const = 0;

public:
	InMatchExpression() : MatchExpression(MatchExpression::MatchType::MATCH_IN) {

	}

	virtual bool Ignored() const override {
		return _values.empty();
	}

};