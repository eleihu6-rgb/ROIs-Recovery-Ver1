#pragma once

#include <vector>
#include "matcher/MatchExpression.h"

#include "CrewDB.h"
#include "UtilFunc.h"

template<typename T>
class AssignmentGroupMatchExpression : public MatchExpression<T> {
private:
	std::vector<std::string> _assignmentGroups{};

	bool MatchSegmentAssignmentGroup(const Activity& activity) const {
		if (_assignmentGroups.empty()) {
			return true;
		}
		const Segment& segment = static_cast<const Segment&>(activity);
		const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();
        const auto &assignment = segment.getAssignment();
		for (auto assigmentGroup : _assignmentGroups) {
			if (dbData->isAssignmentInGroup(assignment, assigmentGroup)) {
				return true;
			}
		}
		return false;
	}

	bool MatchDutyAssignmentGroup(const Activity& activity) const {
		if (_assignmentGroups.empty()) {
			return true;
		}
		const Duty& duty = static_cast<const Duty&>(activity);
		const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();
        const auto &assignment = duty.getAssignment();
		for (auto assigmentGroup : _assignmentGroups) {
			if (dbData->isAssignmentInGroup(assignment, assigmentGroup)) {
				return true;
			}
		}
		return false;
	}

	bool MatchPairingAssignmentGroup(const Activity& activity) const {
		const Pairing& pairing = static_cast<const Pairing&>(activity);
		const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();
        const auto &assignment = pairing.getQualifier();
		for (auto assigmentGroup : _assignmentGroups) {
			if (dbData->isAssignmentInGroup(assignment, assigmentGroup)) {
				return true;
			}
		}
		return false;
	}

	bool MatchRosterAssignmentGroup(const Activity& activity) const {
		const ROSTER& roster = static_cast<const ROSTER&>(activity);
		const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();
        const auto &assignment = roster.qualifier;
		for (const auto &assigmentGroup : _assignmentGroups) {
			if (dbData->isAssignmentInGroup(assignment, assigmentGroup)) {
				return true;
			}
		}
		return false;
	}

	bool MatchMandayActivityAssignmentGroup(const Activity& activity) const {
		const MandayActivity& mandayActivity = static_cast<const MandayActivity&>(activity);
		if (mandayActivity.getType() == MandayActivity::Type::SEGMENT) {
			const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();
            const auto &assignment = mandayActivity.getAssignment();
			for (auto assigmentGroup : _assignmentGroups) {
				if (dbData->isAssignmentInGroup(assignment, assigmentGroup)) {
					return true;
				}
			}
			return false;
		}
		const std::string &assignmentGroup = mandayActivity.getAssignmentGroup();
		auto iter = std::find(_assignmentGroups.cbegin(), _assignmentGroups.cend(), assignmentGroup);
		return iter != _assignmentGroups.cend();
	}
	
protected:

	virtual bool ParseExpression(const std::string& expression) override {
		if (expression == RuleParamConstant::ALL) {
			return true;
		}
		split(expression, '|', _assignmentGroups);
		return true;
	}

	virtual bool MatchImpl(const T& matchable) const override {
		if (typeid(matchable) == typeid(Segment)) {
			return MatchSegmentAssignmentGroup(matchable);
		}
		else if (typeid(matchable) == typeid(ROSTER)) {
			return MatchRosterAssignmentGroup(matchable);
		}
		else if (typeid(matchable) == typeid(Duty)) {
			return MatchDutyAssignmentGroup(matchable);
		}
		else if (typeid(matchable) == typeid(Pairing)) {
			return MatchPairingAssignmentGroup(matchable);
		}
		else if (typeid(matchable) == typeid(MandayActivity)) {
			return MatchMandayActivityAssignmentGroup(matchable);
		}

		return false;
	}

public:

	AssignmentGroupMatchExpression() : MatchExpression<T>(MatchExpression<T>::MatchType::MATCH_IN) {

	}

	virtual bool Ignored() const override {
		return _assignmentGroups.empty();
	}
};

