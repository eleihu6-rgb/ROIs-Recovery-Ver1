#include <stdio.h>
#include <vector>

#include <time.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"

using namespace std;

map<string, vector<DBPortQualReqmnts>> makePortQualReqmntsAirportMap(vector<DBPortQualReqmnts> &list) {
	map<string, vector<DBPortQualReqmnts>> m;
	map<string, vector<DBPortQualReqmnts>>::iterator im;
	vector<DBPortQualReqmnts>::iterator iv = list.begin();

	for (iv = list.begin(); iv != list.end(); iv++) {
		if (0 == strcmp(iv->airline, "*")) {
			continue;
		}
		im = m.find(iv->airport);
		if (im == m.end()) {
			vector<DBPortQualReqmnts> vec;
			m[iv->airport] = vec;
		}
		m[iv->airport].push_back(*iv);
	}


	for (iv = list.begin(); iv != list.end(); iv++) {
		if (0 != strcmp(iv->airline, "*")) {
			continue;
		}
		for (im = m.begin(); im != m.end(); im++) {
			im->second.push_back(*iv);
		}
	}

	return m;
}