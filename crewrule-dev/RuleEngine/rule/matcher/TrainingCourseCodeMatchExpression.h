#pragma once

#include <vector>
#include "matcher/InExMatchExpression.h"

#include "CrewDB.h"
#include "UtilFunc.h"
#include "utils/StringUtils.h"
#include "utils/RosterUtils.h"

template<typename T>
class TrainingCourseCodeMatchExpression : public InExMatchExpression<T> {
private:

	std::vector<std::string> GetCourseCodeForRoster(const Activity& activity, const vector<long long>& flightIds) const {
		std::vector<std::string> result;
		const ROSTER& roster = static_cast<const ROSTER&>(activity);
		const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();
		if (flightIds.empty()) {
			std::shared_ptr<TmCourse> tmCourse = RosterUtils::GetTrainingCourseByRoster(roster, dbData);
			if (tmCourse == nullptr) {
				return result;
			}
			result.emplace_back(tmCourse->courseCode);		
		}
		else {
			for (auto flightId : flightIds) {
				string courseCode = RosterUtils::GetTrainingCourseCodeByRoster(roster, flightId, dbData);
				if (!courseCode.empty()) {
					result.emplace_back(courseCode);
				}
			}
		}
		return result;
	}

	std::vector<std::string> GetCourseCodeForMandayActivity(const Activity& activity, const vector<long long>& flightIds) const {
		std::vector<std::string> result;
		const MandayActivity& mandayActivity = static_cast<const MandayActivity&>(activity);
		const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();
		if (flightIds.empty()) {
			std::shared_ptr<TmCourse> tmCourse = RosterUtils::GetTrainingCourseByMandayActivity(mandayActivity, dbData);
			if (tmCourse == nullptr) {
				return result;
			}
			result.emplace_back(tmCourse->courseCode);		
		}
		else {
			for (auto flightId : flightIds) {
				string courseCode = RosterUtils::GetTrainingCourseCodeByMandayActivity(mandayActivity, flightId, dbData);
				if (!courseCode.empty()) {
					result.emplace_back(courseCode);
				}
			}
		}
		return result;
	}
protected:
	virtual std::vector<std::string> GetMatchableItems(const T& matchable) const {
		std::vector<std::string> result;
		return result;
	}

	std::vector<std::string> GetMatchableItems(const T& matchable, const vector<long long>& flightIds) const {
		std::vector<std::string> result;
		if (typeid(matchable) == typeid(ROSTER)) {
			result = GetCourseCodeForRoster(matchable, flightIds);
		}
		else if (typeid(matchable) == typeid(MandayActivity)) {
			result = GetCourseCodeForMandayActivity(matchable, flightIds);
		}
		else {
			Logger::getRuleLogger()->error("error: Matchable is not ROSTER/MandayActivity object in TrainingCourseCodeMatchExpression class.");
		}
		return result;
	}

	bool MatchImpl(const T& matchable, const vector<long long>& flightIds) const {
		std::vector<std::string> matchableItems = GetMatchableItems(matchable, flightIds);
		return this->MatchIncludedItems(matchableItems) && this->MatchExcludedItems(matchableItems);
	}

public:

	TrainingCourseCodeMatchExpression() : InExMatchExpression<T>(){

	}

	bool Match(const T& matchable, const vector<long long>& flightIds) const {
		if (this->Ignored()) {
			return true;
		}
		return MatchImpl(matchable, flightIds);
	};
};

