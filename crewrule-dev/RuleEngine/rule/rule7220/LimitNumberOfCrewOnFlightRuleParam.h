/**
 * @file LimitNumberOfCrewOnFlightRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITNUMBEROFCREWONFLIGHTRULEPARAM_H_
#define _LIMITNUMBEROFCREWONFLIGHTRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class LimitNumberOfCrewOnFlightRule;

class LimitNumberOfCrewOnFlightRuleParam : public RuleParam {
	friend class LimitNumberOfCrewOnFlightRule;
private:
    explicit LimitNumberOfCrewOnFlightRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7220;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 9;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		FLIGHT_AIRLINE_CODES = 4,
		ACTING_RANKS = 5,
		MIN_BLH_ON_FLIGHT = 6,
		MAX_NUMBER_OF_CREW_ON_FLIGHT = 7,
		SEVERITY = 8
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};
	
	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};
	
	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};
	
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//机上岗位，多个值使用“|”分隔并支持*通配
	std::vector<std::string> _actingRanks{};
	
	//机组人员在航班同机型最小飞时,格式：HH:mm
	std::string _minBLHOnFlight{};
	int _minBLHOnFlightMinutes{};

	//在航班最大机组人员数量
	int _maxNumOfCrew{}; 

	//航班号中航空公司列表。多个值使用“|”分隔并支持*通配
	std::vector<std::string> _flightAirlines{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchFlightAirline(const Segment* segment) const;

};

#endif //_LIMITNUMBEROFCREWONFLIGHTRULEPARAM_H_
