/**
 * @file MinOffDutyPeriodForCcRuleInput.h
 * @brief 
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#ifndef _NEWRULEENGINE_RULEINPUT_H_
#define _NEWRULEENGINE_RULEINPUT_H_

#include <vector>
#include <string>

#include "CrewDB.h"

struct RuleInput{
    std::vector<std::string> ruleParamString;

	//add by hexd 添加DBRule支持
	std::vector<DBRule> dbRules;

	//依赖DbRule规则, Pair<规则ID, 规则参数DBRule列表>
	std::map<int, std::vector<DBRule>> dependDbRules;
};

#endif //_NEWRULEENGINE_RULEINPUT_H_
