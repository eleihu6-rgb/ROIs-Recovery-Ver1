#pragma once

#include <vector>
#include <limits>
#include "matcher/InExMatchExpression.h"

#include "CrewDB.h"
#include "UtilFunc.h"
#include "utils/StringUtils.h"
#include "utils/RosterUtils.h"
#include "utils/CompetenceValidationUtils.h"

template<typename T>
class IPOrCKQualMatchExpression : public InExMatchExpression<T> {
private:

	std::vector<std::string> GetTrainingCrewQualificationForRoster(const Activity& activity) const {
		const ROSTER& roster = static_cast<const ROSTER&>(activity);
		return GetTrainingCrewQualification(roster.idcrew, roster.getStartTimeUtcAct(), roster.getRestStartUtcAct());
	}

	std::vector<std::string> GetTrainingCrewQualificationForMandayActivity(const Activity& activity) const {
		const MandayActivity& mandayActivity = static_cast<const MandayActivity&>(activity);
		return GetTrainingCrewQualification(mandayActivity.getCrewId(), mandayActivity.getStartTimeUtcAct(), mandayActivity.getEndTimeUtcAct());
	}

	std::vector<std::string> GetTrainingCrewQualification(const string& crewId, const time_t activityStartTimeUtc, const time_t activityEndTimeUtc) const {
		std::vector<std::string> result;
		const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();
		auto iterCrew = dbData->crewIdMap.find(crewId);
		if (iterCrew == dbData->crewIdMap.end()) {
			return result;
		}
		for (auto& qual : iterCrew->second->qualificationList) {
			if (CompetenceValidationUtils::IsValid(qual, activityStartTimeUtc, activityEndTimeUtc)) {
				result.emplace_back(qual->qual);
			}
		}
		return result;
	}

protected:

	virtual std::vector<std::string> GetMatchableItems(const T& matchable) const {
		std::vector<std::string> result;
		if (typeid(matchable) == typeid(ROSTER)) {
			result = GetTrainingCrewQualificationForRoster(matchable);
		}
		else if (typeid(matchable) == typeid(MandayActivity)) {
			result = GetTrainingCrewQualificationForMandayActivity(matchable);
		}
		else {
			Logger::getRuleLogger()->error("error: Matchable is not ROSTER/MandayActivity object in IPOrCKQualMatchExpression class.");
		}
		return result;
	}

public:

	IPOrCKQualMatchExpression() : InExMatchExpression<T>(){

	}


};

