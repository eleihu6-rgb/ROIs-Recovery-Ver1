#pragma once

#include <string>
#include "CrewDB.h"
#include "constant/Constants.h"
#include "Rule.h"

template<typename T>
class MatchExpression {

protected:
	virtual bool ParseExpression(const std::string& expression) = 0;

	virtual bool MatchImpl(const T& matchable) const = 0;
public:
	enum class MatchType {
		MATCH_IN = 1,
		MATCH_NOT_IN = 2,
		MATCH_IN_AND_NOT_IN = 3,
		MATCH_EQUAL = 4,
		MATCH_RANGE = 5,
		MATCH_BOOL = 6
	};

	MatchExpression(MatchType type) : _matchType(type), _rule(nullptr) {

	};

	virtual ~MatchExpression() {}

	MatchType GetMatchType() const {
		return _matchType;
	}

	void SetExpression(const std::string expression, const Rule* rule) {
		this->_expression = expression;
		this->_rule = rule;
		ParseExpression(this->_expression);
	}

	std::string GetExpression() const {
		return _expression;
	}

	const std::shared_ptr<CrewDataContext>& GetDataContext() const {
		return _rule->GetDataContext();
	}

	virtual bool Match(const T& matchable) const {
		if (this->Ignored()) {
			return true;
		}
		return MatchImpl(matchable);
	};

	//是否能被忽略匹配
	virtual bool Ignored() const = 0;

private:
	MatchType _matchType;

	const Rule* _rule;

	std::string _expression;

};


