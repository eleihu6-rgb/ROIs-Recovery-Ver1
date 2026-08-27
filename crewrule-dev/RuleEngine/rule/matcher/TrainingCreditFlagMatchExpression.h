#pragma once

#pragma once

#include <vector>
#include "matcher/MatchExpression.h"

#include "CrewDB.h"
#include "UtilFunc.h"

template<typename T>
class TrainingCreditFlagMatchExpression : public MatchExpression<T> {
private:
	std::unique_ptr<bool> _tmCreditFlag{ nullptr };


	bool MatchRosterAssignmentCreditFlag(const Activity& activity) const {
		const ROSTER& roster = static_cast<const ROSTER&>(activity);
		const std::string& assignment = roster.qualifier;
		const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();
		auto iter = dbData->assignmentNameMap.find(assignment);
		if (iter == dbData->assignmentNameMap.end()) {
			return false;
		}
		return iter->second->tmCreditFlag == *_tmCreditFlag;
	}

	bool MatchRosterCourseCreditFlag(const Activity& activity, const vector<long long>& flightIds) const {
		const ROSTER& roster = static_cast<const ROSTER&>(activity);
		const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();
		if (flightIds.empty()) {
			std::shared_ptr<TmCourse> tmCourse = RosterUtils::GetTrainingCourseByRoster(roster, dbData);
			if (tmCourse == nullptr) {
				return false;
			}
			return tmCourse->tmCreditFlag == *_tmCreditFlag;		
		}
		else {
			for (auto flightId : flightIds) {
				std::shared_ptr<TmCourse> tmCourse = RosterUtils::GetTrainingCourseByRoster(roster, flightId, dbData);
				if (tmCourse == nullptr) {
					continue;
				}
				if (tmCourse->tmCreditFlag == *_tmCreditFlag) {
					//训练若存在多个航班，任何一个满足即可
					return true;
				}
			}
		}
		return false;
	}

	bool MatchMandayActivityAssignmentCreditFlag(const Activity& activity) const {
		const MandayActivity& mandayActivity = static_cast<const MandayActivity&>(activity);
		const std::string& assignment = mandayActivity.getAssignment();
		const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();
		auto iter = dbData->assignmentNameMap.find(assignment);
		if (iter == dbData->assignmentNameMap.end()) {
			return false;
		}
		return iter->second->tmCreditFlag == *_tmCreditFlag;
	}

	bool MatchMandayActivityCourseCreditFlag(const Activity& activity, const vector<long long>& flightIds) const {
		const MandayActivity& mandayActivity = static_cast<const MandayActivity&>(activity);
		const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();
		if (flightIds.empty()) {
			std::shared_ptr<TmCourse> tmCourse = RosterUtils::GetTrainingCourseByMandayActivity(mandayActivity, dbData);
			if (tmCourse == nullptr) {
				return false;
			}
			return tmCourse->tmCreditFlag == *_tmCreditFlag;		
		}
		else {
			for (auto flightId : flightIds) {
				std::shared_ptr<TmCourse> tmCourse = RosterUtils::GetTrainingCourseByMandayActivity(mandayActivity, flightId, dbData);
				if (tmCourse == nullptr) {
					continue;
				}
				if (tmCourse->tmCreditFlag == *_tmCreditFlag) {
					//训练若存在多个航班，任何一个满足即可
					return true;
				}
			}
		}
		return false;
	}
protected:

	virtual bool ParseExpression(const std::string& expression) override {
		if (expression == RuleParamConstant::ALL) {
			return true;
		}
		_tmCreditFlag = (expression == "*") ? nullptr : std::make_unique<bool>(expression == "Y");
		return true;
	}

	virtual bool MatchImpl(const T& matchable) const override {
		return false;
	}

	bool MatchImpl(const T& matchable, const vector<long long>& flightIds) const {
		if (typeid(matchable) == typeid(ROSTER)) {
			return MatchRosterAssignmentCreditFlag(matchable) || MatchRosterCourseCreditFlag(matchable, flightIds);
		}
		else if (typeid(matchable) == typeid(MandayActivity)) {
			return MatchMandayActivityAssignmentCreditFlag(matchable) || MatchMandayActivityCourseCreditFlag(matchable, flightIds);
		}

		return false;
	}

public:

	TrainingCreditFlagMatchExpression() : MatchExpression<T>(MatchExpression<T>::MatchType::MATCH_EQUAL) {

	}

	virtual bool Ignored() const override {
		return _tmCreditFlag == nullptr;
	}

	bool Match(const T& matchable, const vector<long long>& flightIds) const {
		if (this->Ignored()) {
			return true;
		}
		return MatchImpl(matchable, flightIds);
	};
};

