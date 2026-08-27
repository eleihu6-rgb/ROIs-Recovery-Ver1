/**
 * @file LimitFleetSectorByQaulificationForHXRuleParam.h
 * @brief
**/

#ifndef _LIMITFLEETSECTORBYQAULIFICATIONFORHXRULEPARAM_H_
#define _LIMITFLEETSECTORBYQAULIFICATIONFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include <string>
#include <vector>

class LimitFleetSectorByQaulificationForHXRule;

class LimitFleetSectorByQaulificationForHXRuleParam : public RuleParam {
	friend class LimitFleetSectorByQaulificationForHXRule;
private:
	explicit LimitFleetSectorByQaulificationForHXRuleParam(const Rule* rule) : RuleParam(rule) {}

	constexpr static unsigned int RuleFuncId = 7494;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 9;

	enum class ParamLocation {
		BASES = 1,
		RANKS,
		FLEETS,
		TEAMS,
		QUALIFICATIONS,
		AFTER_QUAL_EFFDT_DAYS,
		FLIGHT_FLEETS,
		MIN_FLY_SECTORS
	};

	std::vector<std::string> _bases{};
	std::vector<std::string> _ranks{};
	std::vector<std::string> _fleets{};
	std::vector<std::string> _teams{};
	std::vector<std::string> _qualifications{};
	int _afterQualEffDtDays{};
	std::vector<std::string> _flightFleets{};
	int _minFlySectors{};

	void ParseParam(const std::string& paramString);
	void ParseParam(const DBRule& dbRule);

	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;
	bool MatchQualification(const std::shared_ptr<CREW_QUALIFICATION>& qual) const;
	bool MatchFleet(const std::string& fleet) const;
};

#endif //_LIMITFLEETSECTORBYQAULIFICATIONFORHXRULEPARAM_H_
