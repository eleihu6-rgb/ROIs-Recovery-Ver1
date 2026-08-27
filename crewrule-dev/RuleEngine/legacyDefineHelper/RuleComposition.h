/**
 * @file RuleComposition.h
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @date 2024-06-27
**/


#ifndef RULEENGINEFRAMEWORK_RULECOMPOSITION_H
#define RULEENGINEFRAMEWORK_RULECOMPOSITION_H

#include <string>
#include <map>
#include <atomic>

struct RULE_COMPOSITION
{
public:
    std::string name;  //2P,3P
    int priority = -1;// HIERARCHY
    std::map<std::string, int> rankComposition;  //CAP=1,RCAP=2

    bool operator==(const RULE_COMPOSITION& rhs) const;

    bool operator!=(const RULE_COMPOSITION& rhs) const;

    bool operator < (const RULE_COMPOSITION& rhs) const;

    bool isEqualToRankComposition(const std::map<std::string, int>& rankComposition,bool isFD=true);

    ///add by ain
    static std::atomic<long long> instanceCount;
    RULE_COMPOSITION() { RULE_COMPOSITION::instanceCount++; }
    ~RULE_COMPOSITION() { RULE_COMPOSITION::instanceCount--; }
};

#endif //RULEENGINEFRAMEWORK_RULECOMPOSITION_H
