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
class TrainingChiefPilotRankMatchExpression : public InExMatchExpression<T> {
private:

	std::vector<std::string> GetChiefPilotRankForRoster(const Activity& activity) const {
		const ROSTER& roster = static_cast<const ROSTER&>(activity);
		return GetChiefPilotRank(roster.idcrew, roster.getStartTimeUtcAct(), roster.getRestStartUtcAct());
	}

	std::vector<std::string> GetChiefPilotRankForMandayActivity(const Activity& activity) const {
		const MandayActivity& mandayActivity = static_cast<const MandayActivity&>(activity);
		return GetChiefPilotRank(mandayActivity.getCrewId(), mandayActivity.getStartTimeUtcAct(), mandayActivity.getEndTimeUtcAct());
	}

	std::vector<std::string> GetChiefPilotRank(const string& crewId, const time_t activityStartTimeUtc, const time_t activityEndTimeUtc) const {
		std::vector<std::string> result;
		const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();

		auto iterCrew = dbData->crewIdMap.find(crewId);
		if (iterCrew == dbData->crewIdMap.end()) {
			return result;
		}
		time_t INVALID_TIME = utcStrToUtc("9999-12-31");
		for (auto& companyRank : iterCrew->second->companyRankList) {
			if (CompetenceValidationUtils::IsValid(companyRank, activityStartTimeUtc, activityEndTimeUtc)) {
				result.emplace_back(companyRank->companyRank);
			}
		}
		return result;
	}
protected:

	virtual std::vector<std::string> GetMatchableItems(const T& matchable) const {
		std::vector<std::string> result;
		if (typeid(matchable) == typeid(ROSTER)) {
			result = GetChiefPilotRankForRoster(matchable);
		}
		else if (typeid(matchable) == typeid(MandayActivity)) {
			result = GetChiefPilotRankForMandayActivity(matchable);
		}
		else {
			Logger::getRuleLogger()->error("error: Matchable is not ROSTER/MandayActivity object in TrainingChiefPilotRankMatchExpression class.");
		}
		return result;
	}

public:

	TrainingChiefPilotRankMatchExpression() : InExMatchExpression<T>(){

	}


};

