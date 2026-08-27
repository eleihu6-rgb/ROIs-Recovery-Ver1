/**
 * @file LimitMinRestBetweenRostersForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITMINRESTBETWEENROSTERSFORPRRULEPARAM_H_
#define _LIMITMINRESTBETWEENROSTERSFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class LimitMinRestBetweenRostersForPRRule;

class LimitMinRestBetweenRostersForPRRuleParam : public RuleParam {
	friend class LimitMinRestBetweenRostersForPRRule;
private:
    explicit LimitMinRestBetweenRostersForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7309;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 15;

    enum class ParamLocation {
		BASES = 1,
		RANKS,
		FLEETS,
		TEAMS,
		ASSIGNMENT_GROUPS,
		ASSIGNMENTS,
		ATTRIBUTES,
		OVERRIDABLE_ASSIGNMENT_GROUPS,
		CONSECUTIVE_TYPE,
		CONSECUTIVE_TIMES,
		INCLUDE_PAIRING_REST,
		COUNTING_REST_FROM_PAIRING_END_DAY,
		DIRECTION,
		REST_TYPE,
		MIN_REST,
		SEVERITY
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};

	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};

	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};

	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//Roster（飞行或地面）的任务类型组列表。多个值使用“|”分隔并支持*通配
	vector<std::string> _rosterAssignmentGroups{};

	//Roster（飞行或地面）的任务类型列表。多个值使用“|”分隔并支持*通配
	vector<std::string> _rosterAssignments{};

	//满足条件Roster对应Pairing标签列表。多个值使用“|”分隔并支持*通配
	string _strPairingAttributes;
	vector<std::string> _pairingAttributes{};

	//支持|分开多个设置和*通配符。逻辑：如果设置该参数，满足条件的地面或Pairing任务，被当成REST，而不是工作任务去检查后续和前置休息时间要求
	//比如：连续两个LFES之后，必须有24小时休息，Overridable Assignment Groups = SBY，那么满足条件的SBY类任务看成REST，而不是工作任务。
	vector<std::string> _overridableRosterAssignmentGroups;

	//连续次数或天数类型。对Consecutive Times进行说明，取值：D-表示连续天数(基于Roster开始时间), T-表示连续次数。默认：T
	std::string _rosterConsecutiveType{};

	//满足条件(Assignments和Attributes)Roster连续次数或天数。
	//格式：数值类型(表示最大值) 或者 n-m，取值范围[n,m)。1为单个Roster之后最小休息间隔要求，N为在N天内连续N个满足条件Roster的数量
	//同时支持最大连续次数，以及连续次数区间设置。比如 8（表示最大连续次数），8-10（左闭右开）
	std::string _strRosterConsecutiveTimesOrDays{};
	int _rosterConsecutiveTimesOrDaysLower{-1};
	int _rosterConsecutiveTimesOrDaysUpper{-1};
	int _maxRosterConsecutiveTimesOrDays{-1};

	//是否包括Pairing/RosterGround在基地休息(即最后一个Duty的休息)。
	// 取值：Y/N，支持*忽略该参数(表示Y)。Y-检查休息时长包括Pairing/RosterGround在基地休息（最小休息），N-检查休息时长包括Pairing/Roster在基地休息（最小休息）。
	bool _isIncludePairingRest{};

	//是否从Pairing/RosterGround结束日期开始计算休息时间。
	//取值：Y/N，支持*忽略该参数(表示Y)。Y-从Pairing/RosterGround结束时间点开始计算休息时间，N-从Pairing/RosterGround休息开始时间的第二天00:00开始计算休息时间。
	bool _isCountingRestFromPairingEndDay{};

	//休息要求是在满足条件“多个连续的Roster”之前、之后还是前后都需要满足休息间隔要求。
	//取值：Before、After，支持*表示Before和After
	std::string _restDirection{};

	//Roster间休息时间类型。取值：D或R。D-休息日day-off，R-休息时间Rest
	std::string _restType{};
	
	//Roster间最小休息时长或天数。(1) Rest Type='D'，表示Roster间最小休息天数。格式：小数。支持0.5天定义，并且0.5天只能是上午，从[00:00,12:00]。(2)Rest Type='R'，Roster间最小休息时长。格式：HH:mm
	std::string _minRest{};
	//Rest Type='D'，表示Roster间最小休息天数。格式：小数。支持0.5天定义，并且0.5天只能是上午，从[00:00,12:00]
	double _minDayOffDays = 0;
	//Rest Type='R'，Roster间最小休息时长。格式：HH:mm
	int _minRestMinutes = 0;

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchRosterAssignment(const std::string& assignment) const;

	bool MatchRosterAssignmentGroups(const ROSTER* roster) const;

	bool MatchPairingAttributes(const ROSTER* roster) const;

public:
	//匹配参数
	bool MatchParam(const ROSTER* roster) const;

	//匹配Overridable Assignment Groups参数，匹配成功认为是休息
	bool IsRestAssignment(const ROSTER* roster) const;

	/**
	* 判断是否满足连续次数或天数要求
	* @param consecutiveTimesOrDays: 当前连续的次数或天数, 小于0表示连续被断开
	* @param totalConsecutiveTimesOrDays: 总的连续次数或天数
	* @return: true: 满足连续次数或天数要求，false：不满足连续次数或天数要求
	*/
	bool MatchConsecutiveTimesOrDays(const int consecutiveTimesOrDays, const int totalConsecutiveTimesOrDays) const;
};

#endif //_LIMITMINRESTBETWEENROSTERSFORPRRULEPARAM_H_
