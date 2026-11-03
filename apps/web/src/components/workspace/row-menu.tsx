"use client";

import Link from "next/link";
import { Icon } from "./icons";
import { Menu, menuLink } from "./menu";

/** The three-dot menu of a listing row: view, edit and the workflow actions the API says this person may attempt. */
export function RowMenu({
  id,
  title,
  actions,
}: {
  id: string;
  title: string;
  actions: { name: string; label: string }[];
}) {
  return (
    <Menu label={`Actions for ${title}`} button={<Icon name="more" />} panelClassName="min-w-[230px]">
      {(close) => (
        <ul className="m-0 list-none p-0">
          <li>
            <Link href={`/workspace/opportunities/${id}`} onClick={close} className={menuLink}>
              View details
            </Link>
          </li>
          {actions.map((a) => (
            <li key={a.name}>
              <Link
                href={
                  a.name === "edit"
                    ? `/workspace/opportunities/${id}/edit`
                    : `/workspace/opportunities/${id}?do=${a.name}`
                }
                onClick={close}
                className={menuLink}
              >
                {a.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Menu>
  );
}
