/**
 * @file CalculateReducedRestForTGRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-06-26
**/

#ifndef _CALCULATEREDUCEDRESTFORTGRULEPARAM_H_
#define _CALCULATEREDUCEDRESTFORTGRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateReducedRestForTGRule;
class CheckReducedRestForTGRule;

class CalculateReducedRestForTGRuleParam : public RuleParam {
	friend class CalculateReducedRestForTGRule;
	friend class CheckReducedRestForTGRule;
private:
	explicit CalculateReducedRestForTGRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7022;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 6;

	enum class ParamLocation {
		IS_HOME_BASE = 1,
		REST_MIN = 2,
		MAX_TIMES_BETWEEN_DO = 3,
		DO_ASSIGNMENTS = 4,
		DO_ASSIGNMENT_GROUPS = 5,
		IS_REDUCE_NEXT_DUTY_MAX_FDP = 6,
		IS_ADD_NEXT_DUTY_MIN_REST = 7
	};

	//是否在基地,取值：Y/N。*表示未设置
	std::unique_ptr<bool> _isHomeBase{ nullptr };

	//最小休息时长（分钟数）,格式：HH:mm
	int _restMin{};

	//两个DO之间最多几次
	int _maxTimesBetweenDO{};

	//DO 任务类型
	std::vector<std::string> _doAssignments{};
	//DO 任务组
	std::vector<std::string> _doAssignmentGroups{};

	//是否减少下一个duty的max fdp
	std::unique_ptr<bool> _isReduceNextDutyMaxFDP{ nullptr };

	//是否增加下一个duty的min rest
	std::unique_ptr<bool> _isAddNextDutyMinRest{ nullptr };

	void ParseParam(const DBRule& dbRule);

	//匹配是否满足在基地条件
	bool MatchHomeBase(const Duty& duty, const std::string& base) const;

	//是否匹配任务类型
	bool MatchDOAssignment(const std::string& assignment) const;





};

#endif //_CALCULATEREDUCEDRESTFORTGRULEPARAM_H_
