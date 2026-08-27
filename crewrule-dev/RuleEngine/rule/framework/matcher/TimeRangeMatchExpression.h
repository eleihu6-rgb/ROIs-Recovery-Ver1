#pragma once

#include <vector>
#include <limits>
#include "MatchExpression.h"
#include "StringUtil.h"
#include "../utils/TimeUtils.h"

/*
* 匹配时间范围表达式[lower,upper)。表达式格式: HH:mm-HH:mm，*表示通配符
*/
class TimeRangeMatchExpression : public MatchExpression<int> {
private:
	int _lowerHHmm{INT_MIN};
	int _upperHHmm{INT_MAX};

protected:
	bool ParseExpression(const std::string& expression) override {
		vector<string> splitstrs;
		split(expression.c_str(), '-', splitstrs);
		if (splitstrs.size() >= 2) {
			_lowerHHmm = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
			_upperHHmm = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
		}
		return true;
	}

	bool MatchImpl(const int& matchable) const override {
		return matchable >= _lowerHHmm && matchable < _upperHHmm;
	}

public:
	TimeRangeMatchExpression() : MatchExpression(MatchExpression::MatchType::MATCH_RANGE) {

	}

	bool Ignored() const override {
		return _lowerHHmm == INT_MIN && _upperHHmm == INT_MAX;
	}

};