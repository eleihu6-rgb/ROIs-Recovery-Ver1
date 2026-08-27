#include <stdio.h>
#include <vector>

#include <time.h>
#include <iostream>
#include <algorithm>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"


using namespace std;

//合并CrewStatus, 要求qualification相同, 且时间段衔接
//1 循环，对每一item寻找向后衔接的item
//2 若存在, 则将后一个item累加到前一个，并移除后一个item
//3 直到找不到下一个可合并为止
void mergeCrewStatus(vector<SharedPtr<CREW_STATUS>>& list) {
	//20181017 ain, list为空时忽略, 避免for循环 i < 0 - 1不退出问题
	if (list.size() == 0) {
		return;
	}
	bool hasMore = true;
	while (hasMore) {
		bool found = false;
		for (std::size_t i = 0; i + 1 < list.size(); i++) {
			SharedPtr<CREW_STATUS> p = list[i];
			if (p->disable == "true")
				continue;
			for (std::size_t j = i + 1; j < list.size(); j++) {
				
				SharedPtr<CREW_STATUS> q = list[j];
				if (q->disable == "true")
					continue;
				
				if (p->effDt <= q->expdt + 24 * 3600 && q->effDt <= p->expdt + 24 * 3600) {
					found = true;
					p->effDt = min(p->effDt, q->effDt);
					p->expdt = max(p->expdt, q->expdt);
					list.erase(list.begin() + j);
					break;
				}
				
			}
			if (found) break;
		}
		if (!found) {
			hasMore = false;
		}
	}
}
