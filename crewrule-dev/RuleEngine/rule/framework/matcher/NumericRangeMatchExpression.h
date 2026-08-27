#pragma once

#include <vector>
#include <limits>
#include "MatchExpression.h"

/*
* 匹配数值范围表达式[lower,upper]。表达式格式: n-m，*表示通配符
*/
class NumericRangeMatchExpression : public MatchExpression<int> {
private:
	int _lower{INT_MIN};
	int _upper{INT_MAX};

protected:
	bool ParseExpression(const std::string& expression) override {
		vector<string> splitstrs;
		split(expression.c_str(), '-', splitstrs);
		if (splitstrs.size() >= 2) {
			_lower = std::stoi(splitstrs[0].c_str());
			_upper = std::stoi(splitstrs[1].c_str());
		}
		return true;
	}

	bool MatchImpl(const int& matchable) const override {
		return matchable >= _lower && matchable <= _upper;
	}

public:
	NumericRangeMatchExpression() : MatchExpression(MatchExpression::MatchType::MATCH_RANGE) {

	}

	bool Ignored() const override {
		return _lower == INT_MIN && _upper == INT_MAX;
	}

};