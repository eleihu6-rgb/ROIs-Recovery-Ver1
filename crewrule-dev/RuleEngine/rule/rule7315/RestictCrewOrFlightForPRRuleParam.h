/**
 * @file RestictCrewOrFlightForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-09-04
**/

#ifndef _RESTICTCREWORFLIGHTFORPRRULEPARAM_H_
#define _RESTICTCREWORFLIGHTFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class RestictCrewOrFlightForPRRule;

class RestictCrewOrFlightForPRRuleParam : public RuleParam {
	friend class RestictCrewOrFlightForPRRule;
private:
    explicit RestictCrewOrFlightForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7315;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 23;

    enum class ParamLocation {
		CREW_BASES = 1,
		CREW_RANKS = 2,
		CREW_FLEETS = 3,
		CREW_TEAMS = 4,
		CREW_QUALS = 5,
		CREW_NATIONALITIES = 6,
		FLIGHT_COMPOSITIONS = 7,
		FLIGHT_COMPOSITION_OPTIONS = 8,
		FLIGHT_ASSIGNMENTS = 9,
		FLIGHT_COUNTRIES = 10,
		FLIGHT_AIRPORT_CATEGORIES = 11,
		FLIGHT_AIRPORTS = 12,
		FLIGHT_AIRLINES = 13,
		FLIGHT_NUMBERS = 14,
		FLIGHT_TYPES = 15,
		FLIGHT_FLEETS = 16,
		FLIGHT_SUB_FLEETS = 17,
		TAIL_NUMBERS = 18,
		SERVICE_TYPES = 19,
		ACTING_RANKS = 20,
		PAIRING_ATTRIBUTES = 21,
		RESTICT_CREW_OR_FLIGHT = 22,
		SEVERITY = 23
    };

	//机组人员所属基地列表。使用“|”分隔，表示多个值
	vector<string> _crewBases{};

	//机组人员级别列表。使用“|”分隔，表示多个值
	vector<string> _crewRanks{};

	//机组人员机型列表。使用“|”分隔，表示多个值
	vector<string> _crewFleets{};

	//机组人员团队列表。多个值使用“|”分隔并支持*通配
	vector<string> _crewTeams{};

	//机组人员资质列表。多个值使用“|”分隔并支持*通配
	vector<string> _crewQuals{};

	//机组人员国籍列表。多个值使用“|”分隔并支持*通配
	set<string> _crewNationalities{};

	//航班配比列表。多个值使用“|”分隔并支持*通配
	set<string> _flightCompositions{};

	//航班配比option列表。多个值使用“|”分隔并支持*通配
	vector<int> _flightCompositionOptions{};

	//航班assignment列表。多个值使用“|”分隔并支持*通配
	set<string> _flightAssignments{};

	//航班出发或落地国家列表。多个值使用“|”分隔并支持*通配
	set<string> _flightCountries{};

	//航班出发活落地机场类别列表。多个值使用“|”分隔并支持*通配。取值：来自airport表category字段
	set<string> _flightAirportCategories{};

	//航班出发或落地机场列表。多个值使用“|”分隔并支持*通配
	set<string> _flightAirports{};

	//航班号中航空公司列表。多个值使用“|”分隔并支持*通配
	set<string> _flightAirlines{};

	//航班号列表（不包括航司代码）。多个值使用“|”分隔并支持*通配
	set<string> _flightNumbers{};

	//航班类别列表。多个值使用“|”分隔并支持*通配。取值：D - 国内，I - 国际，R - 区域，来自airport表dir字段。
	set<string> _flightTypes{};

	//航班机型列表。多个值使用“|”分隔并支持*通配
	set<string> _flightFleets{};

	//航班子机型列表。多个值使用“|”分隔并支持*通配
	set<string> _flightSubFleets{};

	//航班飞机机尾号列表。多个值使用“|”分隔并支持*通配
	set<string> _flightTailNumbers{};

	//航班Serice Type列表。多个值使用“|”分隔并支持*通配。取值：来自航班表的service type字段
	set<string> _flightServiceTypes{};

	//机组人员在该航班Acting rank列表。多个值使用“|”分隔并支持*通配
	set<string> _actingRanks{};

	//航班所在Pairing的attribute列表。多个值使用“|”分隔并支持*通配
	set<string> _pairingAttributes{};

	//法规检查满足上面条件的Crew，是不能执行满足下面条件的航班，还是满足条件的航班只能油上面Crew执行。取值：C/F 。
	//F - 缺省值，满足条件Crew，不能执行下面航班任务。	C - 满足条件的航班只能由这些Crew执行。
	std::string _restictCrewOrFlight{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchPairingAttributes(const ROSTER* roster) const;

	bool MatchFlightCountries(const Segment* segment) const;

	bool MatchFlightCompositionOption(const Segment* segment) const;

public:

	bool MatchFlight(const ROSTER* roster, const Segment* segment) const;
	
	bool MatchCrewNationalities(const std::shared_ptr<CREW>& crew) const;

	bool MatchCrew(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

};

#endif //_RESTICTCREWORFLIGHTFORPRRULEPARAM_H_
