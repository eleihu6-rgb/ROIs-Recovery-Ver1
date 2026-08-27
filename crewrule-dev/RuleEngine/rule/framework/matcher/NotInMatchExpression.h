#pragma once

#include <vector>
#include "MatchExpression.h"

class NotInMatchExpression : public MatchExpression<std::string> {
private:
	std::vector<std::string> _values{};

protected:
	virtual bool ParseExpression(const std::string& expression) override;

	virtual bool MatchImpl(const std::string& matchable) const override;

public:
	NotInMatchExpression() : MatchExpression(MatchExpression::MatchType::MATCH_NOT_IN) {

	}

	virtual bool Ignored() const override;

};