/**
 * @file CheckInexperiencedCrewFor5JRuleParamParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKINEXPERIENCEDCREWFOR5JRULEPARAM_H_
#define _CHECKINEXPERIENCEDCREWFOR5JRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "../period/BaseActivityPeriod.h"



class CheckInexperiencedCrewFor5JRule;

class CheckInexperiencedCrewFor5JRuleParam : public RuleParam {
	friend class CheckInexperiencedCrewFor5JRule;
private:
	explicit CheckInexperiencedCrewFor5JRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7364;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 8;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		ACTING_RANKS = 4,
		ROUTES = 5,
		ASSIGNMENT_GROUPS = 6,
		ASSIGNMENTS = 7,
		AIRPORT_CATEGORIES = 8,
		MAX_INEXPERIENCE_CREWS = 9
	};

	//Crew的基地列表，支持|分开多个设置和*通配符
	std::vector<std::string> _bases{};
	//Crew的Rank列表，支持|分开多个设置和*通配符
	std::vector<std::string> _ranks{};
	//Crew的Fleet列表，支持|分开多个设置和*通配符
	std::vector<std::string> _fleets{};
	//Crew的Team列表，支持|分开多个设置和*通配符
	std::vector<std::string> _teams{};
	//組員在該duty上的Acting Rank，支持|多選和*忽略該參數
	std::vector<std::string> _actingRanks{};
	//Acting Ranks的字符串类型备份
	std::string _strActingRanks{};
	//航班起飞降落航线列表，如PEK-MNL|MNL-PEK，起飞降落机场用“- ”分开，多个航线用 | 分开。支持通配符 * 
	std::vector<std::string> _routes{};
	//Flight的Assignment Group列表或者地面任务的Assignment Group列表（支持航班Duty和地面Duty），支持 | 分开多个设置以及 * 通配
	std::vector<std::string> _assignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupsMatch;
	//航班或者地面任务的Assignment列表，支持 | 分开多个设置以及 * 通配
	std::vector<std::string> _assignments{};
	AssignmentMatchExpression<Activity> _assignmentsMatch;
	//机场分类列表，支持 | 分开多个设置以及 * 通配
	std::vector<std::string> _airportCategories{};
	//航班上最大Inexperienced Crew上限，格式：整数。即Crew Inexpensive结束日期时间大于航班开始时间，都是Inexperienced Crew
	int _maxInexperienceCrews{};

	void ParseParam(const DBRule& dbRule);


public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchSegmentRuleParam(const Segment* duty) const;

	bool MatchAssignment(const Activity* activity) const;

	bool MatchAssignment(const string& segmentAssignment) const;

	bool MatchRoute(const Segment* segment) const;

	bool MatchAirportCategories(const Segment* segment) const ;
	bool MatchAirportCategories(const ROSTER* roster) const ;

	bool MatchActingRanks(const std::string& actingRank) const;
};

#endif //_CHECKINEXPERIENCEDCREWFOR5JRULEPARAM_H_
