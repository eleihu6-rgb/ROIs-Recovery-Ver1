#pragma once

#include <vector>
#include "matcher/MatchExpression.h"

#include "CrewDB.h"
#include "UtilFunc.h"

template<typename T>
class AssignmentMatchExpression : public MatchExpression<T> {
private:
	std::vector<std::string> _assignments{};

	bool MatchSegmentAssignment(const Activity& activity) const {
		const Segment& segment = static_cast<const Segment&>(activity);
        const std::string &assignment = segment.getAssignment();
		return MatchAssignment(assignment);
	}

	bool MatchDutyAssignment(const Activity& activity) const {
		const Duty& duty = static_cast<const Duty&>(activity);
        const std::string &assignment = duty.getAssignment();
		return MatchAssignment(assignment);
	}

	bool MatchPairingAssignment(const Activity& activity) const {
		const Pairing& pairing = static_cast<const Pairing&>(activity);
		const std::string &assignment = pairing.getQualifier();
		return MatchAssignment(assignment);
	}

	bool MatchRosterAssignment(const Activity& activity) const {
		const ROSTER& roster = static_cast<const ROSTER&>(activity);
		const std::string &assignment = roster.qualifier;
		return MatchAssignment(assignment);
	}

	bool MatchMandayActivityAssignment(const Activity& activity) const {
		const MandayActivity& mandayActivity = static_cast<const MandayActivity&>(activity);
		const std::string &assignment = mandayActivity.getAssignment();
		return MatchAssignment(assignment);
	}

	bool MatchAssignment(const string& assignment) const {
		auto iter = std::find(_assignments.cbegin(), _assignments.cend(), assignment);
		return iter != _assignments.cend();
	}
protected:

	virtual bool ParseExpression(const std::string& expression) override {
		if (expression == RuleParamConstant::ALL) {
			return true;
		}
		split(expression, '|', _assignments);
		return true;
	}

	virtual bool MatchImpl(const T& matchable) const override {
		if (typeid(matchable) == typeid(Segment)) {
			return MatchSegmentAssignment(matchable);
		}
		else if (typeid(matchable) == typeid(ROSTER)) {
			return MatchRosterAssignment(matchable);
		}
		else if (typeid(matchable) == typeid(Duty)) {
			return MatchDutyAssignment(matchable);
		}
		else if (typeid(matchable) == typeid(Pairing)) {
			return MatchPairingAssignment(matchable);
		}
		else if (typeid(matchable) == typeid(MandayActivity)) {
			return MatchMandayActivityAssignment(matchable);
		}
		return false;
	}

public:

	AssignmentMatchExpression() : MatchExpression<T>(MatchExpression<T>::MatchType::MATCH_IN) {

	}

	virtual bool Ignored() const override {
		return _assignments.empty();
	}
};

