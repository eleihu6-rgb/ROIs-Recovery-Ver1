#pragma once

#include <vector>
#include "matcher/InExMatchExpression.h"

#include "CrewDB.h"
#include "UtilFunc.h"
#include "utils/StringUtils.h"
#include "utils/RosterUtils.h"

template<typename T>
class TrainingRoleMatchExpression : public InExMatchExpression<T> {
private:

	std::vector<std::string> GetTrainingRoleForRoster(const Activity& activity, const vector<long long>& flightIds) const {
		const ROSTER& roster = static_cast<const ROSTER&>(activity);
		const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();
		return RosterUtils::GetTrainingRoleByRoster(roster, flightIds, dbData);
	}

	std::vector<std::string> GetTrainingRoleForMandayActivity(const Activity& activity, const vector<long long>& flightIds) const {
		const MandayActivity& mandayActivity = static_cast<const MandayActivity&>(activity);
		const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();
		return RosterUtils::GetTrainingRoleByMandayActivity(mandayActivity, flightIds, dbData);
	}

protected:

	virtual std::vector<std::string> GetMatchableItems(const T& matchable) const {
		std::vector<std::string> result;
		return result;
	}

	std::vector<std::string> GetMatchableItems(const T& matchable, const vector<long long>& flightIds) const {
		std::vector<std::string> result;
		if (typeid(matchable) == typeid(ROSTER)) {
			result = GetTrainingRoleForRoster(matchable, flightIds);
		}
		else if (typeid(matchable) == typeid(MandayActivity)) {
			result = GetTrainingRoleForMandayActivity(matchable, flightIds);
		}
		else {
			Logger::getRuleLogger()->error("error: Matchable is not ROSTER object in TrainingRoleMatchExpression class.");
		}
		return result;
	}

	bool MatchImpl(const T& matchable, const vector<long long>& flightIds) const {
		std::vector<std::string> matchableItems = GetMatchableItems(matchable, flightIds);
		return this->MatchIncludedItems(matchableItems) && this->MatchExcludedItems(matchableItems);
	}

public:

	TrainingRoleMatchExpression() : InExMatchExpression<T>(){

	}

	bool Match(const T& matchable, const vector<long long>& flightIds) const {
		if (this->Ignored()) {
			return true;
		}
		return MatchImpl(matchable, flightIds);
	};
};

