/**
 * @file CalculateMinRestByDutyPeriodForTGRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-06-26
**/

#ifndef _CALCULATEMINRESTBYDUTYPERIODFORTGRULEPARAM_H_
#define _CALCULATEMINRESTBYDUTYPERIODFORTGRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateMinRestByDutyPeriodForTGRule;

class CalculateMinRestByDutyPeriodForTGRuleParam : public RuleParam {
friend class CalculateMinRestByDutyPeriodForTGRule;
private:
    explicit CalculateMinRestByDutyPeriodForTGRuleParam(const Rule* rule):RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7021;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 11;

    enum class ParamLocation {
		IS_HOME_BASE = 1,
		COMPOSITIONS = 2,
		DUTY_ASSIGNMENT_GROUPS = 3,
		DUTY_TYPE = 4,
		SECTORS = 5,
		SINGLE_BLH_RANGE = 6,
		DP_RANGES = 7,
		MULTIPLIED_TYPE = 8,
		REST_MULTIPLIED = 9,
		MIN_REST = 10,
		SEVERITY = 11
    };

	//是否在基地,取值：Y/N。*表示未设置
	std::unique_ptr<bool> _isHomeBase{ nullptr };

	//配比,多个值使用“|”分隔并支持*通配。格式：HH:mm
	vector<std::string> _compositions{};

	//Duty的任务类型,多个值使用“|”分隔并支持*通配。
	vector<std::string> _dutyAssignmentGroups{};

	//Duty的国内国际类型,多个值使用“|”分隔并支持*通配。取值：D-国内航班，I-国际航班，R-区域航班
	vector<std::string> _dutyTypes{};

	//Duty的航段数量，整数，支持*表示忽略
	std::string _sectorsStr{};
	int _sectors{};

	//航段飞时范围列表，多个使用&分割，支持*表示忽略。格式：HH:mm-HH:mm&HH:mm-HH:mm
	std::string _singleBlhRange{};
	std::vector<std::pair<int, int>> _singleBlhRangesMinutes{};

	//Duty内全部Duty Time的区间范围，格式：HH:mm-HH:mm，支持*表示忽略
	std::string _strDpRanges{};
	int _dpRangesMinutesLower{ INT_MIN };
	int _dpRangesMinutesUpper{ INT_MAX };

	//指定Rest Multiplied是根据BLH还是DP或FDP来计算，支持*忽略。取值：BLH/DP/FDP
	std::string _multipliedType{"DP"};

	//Rest乘数，数字，支持*忽略
	std::string _strRestMultiplied{};
	double _restMultiplied{1.0};

	//最小休息时长（分钟数）,格式：HH:mm
	int _minRestMinutes{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//匹配是否满足在基地条件
	bool MatchHomeBase(const Duty& duty, const std::string& base) const;

	//匹配Duty的配比
	bool MatchComposition(const Duty& duty) const;

	//匹配Duty的任务组
	bool MatchDutyAssignmentGroup(const Duty& duty) const;

	//匹配Duty的国内和国际类型
	bool MatchDutyTypes(const Duty& duty) const;

	//匹配Duty的航段数量
	bool MatchSectors(const Duty& duty) const;

	//匹配航段飞时范围
	bool MatchSingleBlhRange(const Duty& duty) const;

	//匹配DP范围内
	bool MatchDPInRanges(const Duty& duty, const ROSTER* roster) const;

	//获取乘以Multiplied Type后的值
	int GetMultipliedValue(const Duty& duty, const ROSTER* roster) const;

public:
	bool MatchParam(const Duty& duty, const ROSTER* roster, const string& base) const;

};

#endif //_CALCULATEMINRESTBYDUTYPERIODFORTGRULEPARAM_H_
