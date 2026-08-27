/**
 * @file CheckIOEPhaseFlightCompositionRuleParamParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKIOEPHASEFLIGHTCOMPOSITIONRULEPARAM_H_
#define _CHECKIOEPHASEFLIGHTCOMPOSITIONRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckIOEPhaseFlightCompositionRule;

class CheckIOEPhaseFlightCompositionRuleParam : public RuleParam {
	friend class CheckIOEPhaseFlightCompositionRule;
private:
	explicit CheckIOEPhaseFlightCompositionRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7274;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		ROUTES = 1,
		CREW_ROLES = 2,
		ACTING_RANKS = 3,
		FOOTPRINT_TYPES = 4,
		IOE_PAHSE = 5,
		COURSE_CODES = 6,
		MIN_COMPOSITION_WITHOUT_TE = 7
	};

	std::vector<std::string> _routes{};

	std::vector<std::string> _crewRoles{};

	std::vector<std::string> _actingRanks{};

	std::vector<std::string> _footprintTypes{};

	std::vector<std::string> _subFootprintTypes{};

	std::string _ioePhase{};

	std::vector<std::string> _courseCodes{};

	std::vector<std::map<std::string, int>> _minCompositionWithoutTE{};

	void ParseParam(const DBRule& dbRule);


public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchFlight(const Segment* segment) const;

	bool MatchRosterFlight(const shared_ptr<RosterFlight>& rosterFlight) const;

	bool MatchTraining(const shared_ptr<RosterFlight>& rosterFlight) const; 

	bool MatchCompostion(const std::map<std::string, int> flightComposition) const;
};

#endif //_CHECKIOEPHASEFLIGHTCOMPOSITIONRULEPARAM_H_
