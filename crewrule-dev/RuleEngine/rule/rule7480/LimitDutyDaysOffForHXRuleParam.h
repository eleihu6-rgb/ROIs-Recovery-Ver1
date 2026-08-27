/**
 * @file LimitDutyDaysOffForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-14
**/

#ifndef _LIMITDUTYDAYSOFFFORHXRULEPARAM_H_
#define _LIMITDUTYDAYSOFFFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include <string>
#include "matcher/AssignmentGroupMatchExpression.h"

class LimitDutyDaysOffForHXRule;

class LimitDutyDaysOffForHXRuleParam : public RuleParam {
	friend class LimitDutyDaysOffForHXRule;
private:
    explicit LimitDutyDaysOffForHXRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7480;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 16;

    enum class ParamLocation {
		BASES = 1,
		RANKS ,
		FLEETS,
		TEAMS,
		CONSECUTIVE_DAYS,
		CREW_AGREE_TO_WORK_ON_THE_LAST_DAY,
		DHD_ON_THE_LAST_DAY,
		EXCLUDING_FIRST_RECOVERY_6_OFFSET_DO,
		FOLLOWING_START_OF_DDO,
		LAYOVER_ASSIGNMENTS,
		LAYOVER_ASSIGNMENTS_DURATION,
		MIN_CONSECUTIVE_DO,
		MIN_DO
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};

	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};

	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};

	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//最大连续天数（基地日历日，基地时区）。
	int _consecutiveDays{};

	//组员连续工作的最后一天是否仍然同意工作。取值：Y/N或者*，*表示N
	std::shared_ptr<bool> _isCrewAgreeWork{nullptr};

	//组员连续工作的最后一天是否允许是置位任务。取值：Y/N或者*，*表示N
	std::shared_ptr<bool> _isDHDLastDay{ nullptr };

	//不包括 第一个恢复成适应状态后6小时时区第1个DDO。
	std::shared_ptr<bool> _excludingFirstRecovery6OffsetdDo{nullptr};

	//最小连续DO次数。*忽略该参数
	std::shared_ptr<int> _minConsecutiveDO{nullptr};

	//最小DO次数。*忽略该参数
	std::shared_ptr<int> _minDO{nullptr};

	//是否是DDO开始后检查。取值：Y/N或者*，*表示忽略（不启用DDO后检查逻辑）
	std::shared_ptr<bool> _followingStartOfDDO{nullptr};

	//在Duty Layover安排的任务类型(一般地面任务)，多个使用|分割，支持*忽略
	std::string _strLayoverAssignments{};
	std::vector<std::string> _layoverAssignments{};

	//在Duty Layover安排的单个任务持续时长，格式：HH:mm，支持*忽略
	std::string _strLayoverAssignmentsDuration{};
	int _layoverAssignmentsDuration{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;
public:
	//获得增加的连续天数
	int GetIncConsecutiveDays() const;

	//是否检查Layover Assignment
	bool IsCheckLayoverAssignment() const;
};

#endif //_LIMITDUTYDAYSOFFFORHXRULEPARAM_H_
