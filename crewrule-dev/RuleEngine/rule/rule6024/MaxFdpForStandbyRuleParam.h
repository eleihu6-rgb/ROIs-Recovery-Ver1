/**
 * @file MaxFdpForStandbyRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _MAXFDPFORSTANDBYRULEPARAM_H_
#define _MAXFDPFORSTANDBYRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class CheckMaxFdpForStandbyRule;
class CalculateMaxFdpForStandbyRule;

class MaxFdpForStandbyRuleParam : public RuleParam {
	friend class CheckMaxFdpForStandbyRule;
	friend class CalculateMaxFdpForStandbyRule;
private:
    explicit MaxFdpForStandbyRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6024;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 12;

    enum class ParamLocation {
		IS_HOME_BASE = 0,
		COMPOSITIONS = 1,
		STANDBY_ASSIGNMENT_GROUPS = 2,
		STANDBY_ASSIGNMENTS = 3,
		ACC_STATE = 4,
		INCLUDING_SPLIT_DUTY = 5,
		MIN_SPLIT_REST = 6,
		REST_FACILITY = 7,
		WOCL_WINDOW = 8,
		EARLY_START_WINDOW = 9,
		MAX_CALL_OUT_FDP = 10,
		EXTEND_MAX_FDP_BY_STANDBY = 11,
		SEVERITY = 12
    };

	//是否在基地,取值：Y/N。*表示未设置
	std::unique_ptr<bool> _isHomeBase{ nullptr };

	//配比,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _compositions{};

	//Standby的任务类型组,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _standbyAssignmentGroups{};

	//Standby的任务类型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _standbyAssignments{};

	//适用状态,取值：A-适应状态，U-未知状态
	std::string _acclimatizationState{};

	//是否包含Split Duty,取值：Y - 包含（是），N-不包含（否）。若设置为*，则忽略Split Duty相关配置。
	std::unique_ptr<bool> _isIncludingSplitDuty{ nullptr };
	
	//Split Duty的最小休息时长（分钟数）,格式：HH:mm
	std::string _minSplitRest{};
	int _minSplitRestMinutes{ 0 };

	//机场休息设施等级,取值：S-Sleep睡眠设施、R-Rest休息设施，S等级高于R，即满足S肯定满足R
	std::string _restFacility{};

	//WOCL时间窗口范围（分钟数）,格式：HH:mm-HH:mm
	std::string _woclWindow{};
	std::string _woclWindowHHmmLower{};
	std::string _woclWindowHHmmUpper{};

	//Early Start(ES)时间窗口范围（分钟数）,格式：HH:mm-HH:mm
	std::string _esWindow{};
	std::string _esWindowHHmmLower{};
	std::string _esWindowHHmmUpper{};


	//召回Max FDP（分钟数）,格式：HH:mm。若配置为*，表示忽略该参数。与“Extend Max FDP by Standby(Y/N)”参数二选一。
	std::string _strMaxFDP{};
	int _maxFDPMinutes{ -1 };

	//通过抓飞已执行Standby来扩展Max FDP，MaxFDP=MaxFDP+Callout Standby。取值：Y/N。若配置为*，表示忽略该参数。与“Max Call out FDP”参数二选一
	std::unique_ptr<bool> _isExtendMaxFDPByStandby{ nullptr };

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//是否忽略"Layover最小休息时长（分钟数）"参数，返回true-忽略，false-未忽略
	bool ignoreMaxCalloutFDP() const;

	//是否忽略"召回Max FDP（分钟数）"参数，返回true-忽略，false-未忽略
	bool ignoreExtendMaxFDPByStandby() const;


	//匹配是否满足在基地条件
	bool MatchHomeBase(const Duty& duty, const std::string& base) const;

	//匹配配比
	bool MatchComposition(const Duty& duty) const;

	//匹配生理适应期
	bool MatchAcclimatizationState(const Duty& duty) const;

	//匹配Standby Duty的任务类型组
	bool MatchStandbyAssignmentGroups(const string& standbyAssignmentGroup) const;

	//匹配Standby Duty的任务类型
	bool MatchStandbyAssignments(const string& standbyAssignment) const;

	//匹配是否是Split Duty以及Min Split Rest
	bool MatchSplitDuty(const Duty& duty) const;

	//匹配机场休息设施
	bool MatchRestFacility(const Duty& duty) const;

	//匹配SplitDuty和机场休息设施
	bool MatchSplitDutyAndRestFacility(const Duty& duty) const;
	
	//匹配WOCL时间窗口范围,不在范围内返回true，否则返回false
	bool MatchWOCLWindow(const Duty& duty) const;

	//匹配Early Start时间窗口范围,不在范围内返回true，否则返回false
	bool MatchEarlyStartWindow(const Duty& duty) const;

public:

	//匹配是否满足参数
	bool MatchParam(const string& standbyAssignmentGroup, const string& standbyAssignment, const Duty& duty, const string& base) const;

};

#endif //_MAXFDPFORSTANDBYRULEPARAM_H_
