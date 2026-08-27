/**
 * @file CrewOperatingRecencyRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CREWOPERATINGRECENCYRULEPARAM_H_
#define _CREWOPERATINGRECENCYRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class CheckCrewOperatingRecencyRule;

class CrewOperatingRecencyRuleParam : public RuleParam {
	friend class CheckCrewOperatingRecencyRule;
private:
    explicit CrewOperatingRecencyRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7016;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		ASSIGNMENTS = 4,
		MAX_DAYS_SINCE_LAST_OPERATING = 5,
		OPERATING_FLEETS = 6,
		OPERATING_AIRPORTS = 7,
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
	
	//当前Roster的任务类型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _assignments{};

	//自从上次执行飞行任务（Assigments）最大允许天数
	int _maxDaysSinceLastOperating{0};

	//自从上次执行飞行任务的运行机型列表,多个值使用“|”分隔并支持*通配
	std::string _strOperFleets{};
	std::set<std::string> _operFleets{};

	//自从上次执行飞行任务的运行机场列表,多个值使用“|”分隔并支持*通配
	std::string _strOperAirports{};
	std::set<std::string> _operAirports{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchAssignments(const ROSTER* currRoster) const;

	//匹配运行机型和机场
	bool MatchOperatingFleetAndAirport(const ROSTER* currRoster) const;

	//匹配运行机型
	bool MatchOperatingFleet(const Segment* segment) const;

	//匹配运行机场
	bool MatchOperatingAirport(const Segment* segment) const;

	//飞行岗位，检查规则
	int CheckRuleForFd(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

	//客舱岗位，检查规则
	int CheckRuleForCC(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
		MAX_DAYS_SINCE_LAST_OPERATING_WARN = 1, //自从上次执行飞行任务（Assigments）最大允许天数
		NO_OPERATING_FLEETS_WARN = 2, //“自从上次执行飞行任务的运行机型”不满足告警(无运行机型，则告警)
		NO_OPERATING_AIRPORTS_WARN = 4 //“自从上次执行飞行任务的运行机场”不满足告警(无运行机场，则告警)
	};

	//匹配是否满足参数
	bool MatchParam(const ROSTER* roster) const;

	int CheckRule(const ROSTER* roster) const;

private:

	int GetWarnCode(const std::set<WarnCode>& warnCodes) const;
};

#endif //_CREWOPERATINGRECENCYRULEPARAM_H_
