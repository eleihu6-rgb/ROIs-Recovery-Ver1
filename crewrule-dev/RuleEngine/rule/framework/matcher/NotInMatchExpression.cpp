#include "NotInMatchExpression.h"

#include "UtilFunc.h"

bool NotInMatchExpression::ParseExpression(const std::string& expression) {
	if (expression == RuleParamConstant::ALL) {
		return true;
	}
	split(expression, '|', _values);
	return true;
}

bool NotInMatchExpression::Ignored() const {
	return _values.empty();
}

bool NotInMatchExpression::MatchImpl(const std::string& matchable) const {
	auto iter = std::find(_values.cbegin(), _values.cend(), matchable);
	return iter == _values.cend();
}